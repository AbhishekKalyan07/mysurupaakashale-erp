import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { useAttendanceByDate, useCheckIn, useCheckOut } from '@/features/hr/hooks/useAttendance';
import { LogIn, LogOut, CheckCircle, Clock } from 'lucide-react';
import { useAuth } from '@/features/auth/hooks/useAuth';

export function StaffAttendanceCard() {
  const { firebaseUser: user } = useAuth();
  const date = new Date().toISOString().split('T')[0];
  const { data: attendance, isLoading } = useAttendanceByDate(date);
  const checkIn = useCheckIn();
  const checkOut = useCheckOut();

  if (isLoading || !user) return null;

  const myRecord = attendance?.find(a => a.staffId === user.uid);
  const isPresent = !!myRecord;
  const isCheckedOut = !!myRecord?.checkOutTime;

  const handleCheckIn = async () => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
    await checkIn.mutateAsync({ staffId: user.uid, staffName: user.displayName || 'Staff', date, time });
  };

  const handleCheckOut = async () => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
    await checkOut.mutateAsync({ staffId: user.uid, date, time });
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-leaf-50 flex items-center justify-center text-leaf-600">
            <Clock size={20} />
          </div>
          <div>
            <h2 className="font-display font-semibold text-ink-900">Today's Attendance</h2>
            <p className="text-xs text-ink-500 font-sans mt-0.5">
              {isPresent ? (isCheckedOut ? 'Completed' : 'Checked In') : 'Not Checked In'}
            </p>
          </div>
        </div>
        <div>
          {!isPresent ? (
            <Button 
              size="sm" 
              onClick={handleCheckIn}
              isLoading={checkIn.isPending}
            >
              <LogIn size={16} className="mr-2" /> Check In
            </Button>
          ) : !isCheckedOut ? (
            <div className="flex items-center gap-3">
              <span className="text-xs font-data text-ink-600">
                In: {myRecord.checkInTime}
              </span>
              <Button 
                size="sm" 
                variant="secondary"
                onClick={handleCheckOut}
                isLoading={checkOut.isPending}
              >
                <LogOut size={16} className="mr-2" /> Check Out
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Badge tone="success">Completed ({myRecord.totalWorkingHours} hrs)</Badge>
              <span className="text-leaf-600"><CheckCircle size={18} /></span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
