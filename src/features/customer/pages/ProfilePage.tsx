import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { User, MapPin, AlertCircle, Save } from 'lucide-react';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { userRepository } from '@/shared/services/firestore/userRepository';
import { useCustomerAddresses } from '@/features/customer/hooks/useCustomerAddresses';
import { PageHeader } from '@/shared/components/layout/PageHeader';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import toast from 'react-hot-toast';
import { serverTimestamp } from 'firebase/firestore';

const INDIAN_MOBILE_REGEX = /^(?:\+91[-\s]?)?[6-9]\d{9}$/;

const profileSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name'),
  phone: z.string().regex(INDIAN_MOBILE_REGEX, 'Enter a valid 10-digit mobile number'),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

const addressFormSchema = z.object({
  label: z.string().min(1, 'Label is required (e.g., Home, Office)').max(50),
  line1: z.string().min(5, 'Address line 1 must be at least 5 characters').max(200),
  line2: z.string().max(200).optional(),
  city: z.string().min(1, 'City is required').max(100),
  state: z.string().min(1, 'State is required').max(100),
  pincode: z.string().regex(/^[1-9][0-9]{5}$/, 'Pincode must be exactly 6 digits'),
});

type AddressFormValues = z.infer<typeof addressFormSchema>;

export function ProfilePage() {
  const { profile, firebaseUser } = useAuth();
  const [searchParams] = useSearchParams();
  const isOnboarding = searchParams.get('onboarding') === 'true';
  const [isSaving, setIsSaving] = useState(false);

  const {
    addresses,
    addAddress,
    deleteAddress,
    isAdding,
    isDeleting,
  } = useCustomerAddresses();

  const [showAddressForm, setShowAddressForm] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: profile?.fullName || '',
      phone: profile?.phone || '',
    },
  });

  const {
    register: registerAddr,
    handleSubmit: handleAddrSubmit,
    reset: resetAddr,
    formState: { errors: addrErrors },
  } = useForm<AddressFormValues>({
    resolver: zodResolver(addressFormSchema),
    defaultValues: {
      label: 'Home',
      city: 'Mysuru',
      state: 'Karnataka',
    },
  });

  useEffect(() => {
    if (profile) {
      reset({
        fullName: profile.fullName,
        phone: profile.phone,
      });
    }
  }, [profile, reset]);

  const onSubmit = async (values: ProfileFormValues) => {
    if (!firebaseUser) return;
    setIsSaving(true);
    try {
      await userRepository.update(firebaseUser.uid, {
        fullName: values.fullName,
        phone: values.phone,
        updatedAt: serverTimestamp() as any,
      });
      toast.success('Profile updated successfully!');
      
      if (isOnboarding && addresses.length === 0) {
        toast('Next, please add a delivery address below.', { icon: '📍' });
      } else if (isOnboarding) {
        // Just reload to clear query param and bypass guard
        window.location.href = '/dashboard';
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const onAddressSubmit = async (data: AddressFormValues) => {
    try {
      await addAddress({
        ...data,
        isDefault: addresses.length === 0,
        lat: null,
        lng: null,
      });
      setShowAddressForm(false);
      resetAddr();
      toast.success('Address added');
      
      if (isOnboarding) {
        window.location.href = '/dashboard';
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to add address');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="mb-6">
        <PageHeader title={isOnboarding ? "Complete Your Profile" : "My Profile"} />
        <p className="text-sm text-ink-600 mt-2">
          {isOnboarding ? "We need a few more details to set up your deliveries." : "Manage your personal information and addresses."}
        </p>
      </div>

      {isOnboarding && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl flex items-start gap-3">
          <AlertCircle className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm">
            Welcome! To ensure smooth deliveries, please provide your mobile number and add at least one delivery address before continuing.
          </p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h2 className="text-xl font-bold flex items-center gap-2 mb-6">
            <User className="text-leaf-600" /> Personal Details
          </h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Email</label>
              <input 
                type="text" 
                value={profile?.email || ''} 
                disabled 
                className="w-full rounded-md border border-rice-300 bg-rice-50 px-3 py-2 text-sm text-ink-500 cursor-not-allowed" 
              />
              <p className="text-xs text-ink-400 mt-1">Email cannot be changed.</p>
            </div>
            
            <Input
              label="Full Name"
              autoComplete="name"
              required
              error={errors.fullName?.message}
              {...register('fullName')}
            />
            
            <Input
              label="Mobile Number"
              type="tel"
              inputMode="numeric"
              required
              placeholder="98765 43210"
              error={errors.phone?.message}
              {...register('phone')}
            />

            <Button type="submit" isLoading={isSaving} className="w-full mt-4">
              <Save size={16} className="mr-2" /> Save Profile
            </Button>
          </form>
        </Card>

        <Card className="p-6">
          <h2 className="text-xl font-bold flex items-center gap-2 mb-6">
            <MapPin className="text-blue-600" /> My Addresses
          </h2>
          
          <div className="space-y-4">
            {addresses.length === 0 && !showAddressForm ? (
              <div className="text-center py-6 bg-rice-50 rounded-xl border border-dashed border-rice-300">
                <MapPin className="mx-auto h-8 w-8 text-ink-300 mb-2" />
                <p className="text-sm text-ink-500 mb-4">No addresses saved yet.</p>
                <Button variant="secondary" onClick={() => setShowAddressForm(true)}>
                  Add New Address
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {addresses.map((address) => (
                  <div key={address.id} className="p-4 rounded-xl border border-rice-200 bg-white flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-ink-900">{address.label}</span>
                        {address.isDefault && (
                          <span className="bg-leaf-100 text-leaf-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-ink-600">{address.line1}</p>
                      {address.line2 && <p className="text-sm text-ink-600">{address.line2}</p>}
                      <p className="text-sm text-ink-600">{address.city}, {address.state} {address.pincode}</p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-danger hover:bg-danger-subtle hover:text-danger-active"
                      onClick={() => deleteAddress(address.id!)}
                      disabled={isDeleting}
                    >
                      Remove
                    </Button>
                  </div>
                ))}

                {!showAddressForm && (
                  <Button variant="secondary" className="w-full" onClick={() => setShowAddressForm(true)}>
                    + Add Another Address
                  </Button>
                )}
              </div>
            )}

            {showAddressForm && (
              <form onSubmit={handleAddrSubmit(onAddressSubmit)} className="space-y-4 bg-rice-50 p-4 rounded-xl border border-rice-200 mt-4">
                <h3 className="font-bold text-ink-900 text-sm mb-2">New Address</h3>
                <Input label="Label (e.g. Home, Office)" required error={addrErrors.label?.message} {...registerAddr('label')} />
                <Input label="Address Line 1" required error={addrErrors.line1?.message} {...registerAddr('line1')} />
                <Input label="Address Line 2 (Optional)" error={addrErrors.line2?.message} {...registerAddr('line2')} />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="City" required error={addrErrors.city?.message} {...registerAddr('city')} />
                  <Input label="State" required error={addrErrors.state?.message} {...registerAddr('state')} />
                </div>
                <Input label="Pincode" required error={addrErrors.pincode?.message} {...registerAddr('pincode')} />
                
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="ghost" onClick={() => setShowAddressForm(false)}>Cancel</Button>
                  <Button type="submit" isLoading={isAdding}>Save Address</Button>
                </div>
              </form>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
