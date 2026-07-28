import { useState } from 'react';
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';
import { PremiumBadge as Badge } from '@/shared/components/ui/PremiumBadge';
import { PremiumTable, PremiumTableRow, PremiumTableCell } from '@/shared/components/ui/PremiumTable';
import { HeroBanner } from '@/shared/components/ui/HeroBanner';
import { MetricCard } from '@/shared/components/ui/MetricCard';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';
import { useAttendanceByDate, useCheckIn, useCheckOut } from '../hooks/useAttendance';
import { useStaffUsers } from '@/features/admin/hooks/useAdmin';
import { Calendar, LogIn, LogOut, CheckCircle, Users } from 'lucide-react';

export function AttendanceDashboardPage() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const { data: staff, isLoading: isLoadingStaff } = useStaffUsers();
  const { data: attendance, isLoading: isLoadingAttendance } = useAttendanceByDate(date);
  const checkIn = useCheckIn();
  const checkOut = useCheckOut();

  const isLoading = isLoadingStaff || isLoadingAttendance;

  if (isLoading) return <LoadingScreen />;

  const staffList = staff || [];
  const attendanceList = attendance || [];

  const handleCheckIn = async (staffId: string, staffName: string) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
    await checkIn.mutateAsync({ staffId, staffName, date, time });
  };

  const handleCheckOut = async (staffId: string) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
    await checkOut.mutateAsync({ staffId, date, time });
  };

  return (
    <div className="space-y-8">
      <HeroBanner 
        userName="HR Team"
        subtitle="Track daily staff check-ins and check-outs."
        actions={
          <div className="flex gap-2 items-center bg-white/10 backdrop-blur-md p-1 rounded-xl">
            <input 
              type="date" 
              value={date} 
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent border-none text-primary font-medium text-sm focus:ring-0 cursor-pointer"
            />
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
        <MetricCard
          title="Total Staff"
          value={staffList.length}
          icon={<Users size={24} />}
          color="blue"
        />
        <MetricCard
          title="Present Today"
          value={attendanceList.length}
          icon={<CheckCircle size={24} />}
          color="mint"
        />
        <MetricCard
          title="Absent Today"
          value={Math.max(0, staffList.length - attendanceList.length)}
          icon={<Calendar size={24} className="text-danger" />}
          color="rose"
        />
        <MetricCard
          title="Late Arrivals"
          value={attendanceList.filter(a => (a.checkInTime || '') > '09:30').length}
          icon={<LogIn size={24} className="text-warning" />}
          color="amber"
        />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="p-6">
          <PremiumTable
            columns={['Staff Member', 'Role', 'Status', 'Check In', 'Check Out', 'Total Hours', 'Actions']}
            isEmpty={staffList.length === 0}
            emptyState="No staff found. Add staff members in Staff Management first."
          >
            {staffList.map(user => {
              const record = attendanceList.find(a => a.staffId === user.id);
              const isPresent = !!record;
              const isCheckedOut = !!record?.checkOutTime;

              return (
                <PremiumTableRow key={user.id}>
                  <PremiumTableCell className="font-semibold text-primary">
                    {user.fullName}
                  </PremiumTableCell>
                  <PremiumTableCell className="capitalize text-text-muted">
                    {user.role.replace('_', ' ')}
                  </PremiumTableCell>
                  <PremiumTableCell>
                    <Badge variant={isPresent ? 'success' : 'default'}>
                      {isPresent ? (isCheckedOut ? 'Completed' : 'Present') : 'Absent'}
                    </Badge>
                  </PremiumTableCell>
                  <PremiumTableCell className="text-text-muted font-data">
                    {record?.checkInTime || '-'}
                  </PremiumTableCell>
                  <PremiumTableCell className="text-text-muted font-data">
                    {record?.checkOutTime || '-'}
                  </PremiumTableCell>
                  <PremiumTableCell className="text-primary font-data font-semibold">
                    {record?.totalWorkingHours ? `${record.totalWorkingHours} hrs` : '-'}
                  </PremiumTableCell>
                  <PremiumTableCell>
                    <div className="flex justify-end gap-2">
                      {!isPresent ? (
                        <Button 
                          size="sm" 
                          onClick={() => handleCheckIn(user.id, user.fullName)}
                          isLoading={checkIn.isPending && checkIn.variables?.staffId === user.id}
                        >
                          <LogIn size={14} className="mr-1" /> Check In
                        </Button>
                      ) : !isCheckedOut ? (
                        <Button 
                          size="sm" 
                          variant="secondary"
                          onClick={() => handleCheckOut(user.id)}
                          isLoading={checkOut.isPending && checkOut.variables?.staffId === user.id}
                        >
                          <LogOut size={14} className="mr-1" /> Check Out
                        </Button>
                      ) : (
                        <span className="text-success flex items-center gap-1 text-sm font-semibold justify-end">
                          <CheckCircle size={14} /> Done
                        </span>
                      )}
                    </div>
                  </PremiumTableCell>
                </PremiumTableRow>
              );
            })}
          </PremiumTable>
        </div>
      </Card>
    </div>
  );
}
