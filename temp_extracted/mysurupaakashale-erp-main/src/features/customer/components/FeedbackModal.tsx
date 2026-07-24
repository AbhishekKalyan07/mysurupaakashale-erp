import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MessageSquareWarning, X } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { feedbackRepository } from '@/shared/services/firestore/feedbackRepository';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { serverTimestamp } from 'firebase/firestore';
import { toast } from 'react-hot-toast';

const feedbackSchema = z.object({
  category: z.enum(['food_quality', 'delivery_issue', 'packaging', 'other']),
  message: z.string().min(10, 'Please provide more details (at least 10 characters).').max(500),
});

type FeedbackFormValues = z.infer<typeof feedbackSchema>;

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const { firebaseUser } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors }, reset } = useForm<FeedbackFormValues>({
    resolver: zodResolver(feedbackSchema),
    defaultValues: {
      category: 'food_quality',
      message: '',
    }
  });

  if (!isOpen) return null;

  const onSubmit = async (data: FeedbackFormValues) => {
    if (!firebaseUser) return;
    setIsSubmitting(true);
    try {
      await feedbackRepository.create({
        customerId: firebaseUser.uid,
        category: data.category,
        message: data.message,
        status: 'new',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast.success('Feedback submitted successfully. We will look into it!');
      reset();
      onClose();
    } catch (error) {
      console.error(error);
      toast.error('Failed to submit feedback.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 backdrop-blur-sm p-4">
      <Card className="w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold flex items-center gap-2 text-ink-900">
            <MessageSquareWarning className="text-amber-500" /> Report an Issue
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X size={20} />
          </Button>
        </div>
        
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Issue Category</label>
            <select
              {...register('category')}
              className="w-full rounded-md border border-rice-300 bg-white px-3 py-2 text-sm focus:border-leaf-500 focus:outline-none focus:ring-1 focus:ring-leaf-500"
            >
              <option value="food_quality">Food Quality</option>
              <option value="delivery_issue">Delivery Issue / Delay</option>
              <option value="packaging">Packaging Problem</option>
              <option value="other">Other</option>
            </select>
            {errors.category && <p className="text-xs text-danger mt-1">{errors.category.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Message</label>
            <textarea
              {...register('message')}
              rows={4}
              placeholder="Please describe the issue..."
              className="w-full rounded-md border border-rice-300 bg-white px-3 py-2 text-sm focus:border-leaf-500 focus:outline-none focus:ring-1 focus:ring-leaf-500"
            />
            {errors.message && <p className="text-xs text-danger mt-1">{errors.message.message}</p>}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-rice-200">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Submit Feedback
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
