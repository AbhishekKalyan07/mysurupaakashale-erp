import { useState } from 'react';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';
import { EmptyState } from '@/shared/components/feedback/EmptyState';
import { useAttendanceByDate, useCheckIn, useCheckOut } from '../hooks/useAttendance';
import { useStaffUsers } from '@/features/admin/hooks/useAdmin';
import { Calendar, LogIn, LogOut, CheckCircle } from 'lucide-react';

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
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-900 flex items-center gap-2">
            <Calendar className="text-leaf-600" />
            Attendance Management
          </h1>
          <p className="text-sm text-ink-500 font-sans mt-1">
            Track daily staff check-ins and check-outs.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <input 
            type="date" 
            value={date} 
            onChange={(e) => setDate(e.target.value)}
            className="border border-rice-300 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-leaf-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 flex flex-col gap-1">
          <div className="text-sm font-medium text-ink-500">Total Staff</div>
          <div className="text-2xl font-bold text-ink-900 font-data">{staffList.length}</div>
        </Card>
        <Card className="p-4 flex flex-col gap-1">
          <div className="text-sm font-medium text-ink-500">Present Today</div>
          <div className="text-2xl font-bold text-success font-data">{attendanceList.length}</div>
        </Card>
        <Card className="p-4 flex flex-col gap-1">
          <div className="text-sm font-medium text-ink-500">Absent Today</div>
          <div className="text-2xl font-bold text-danger font-data">{Math.max(0, staffList.length - attendanceList.length)}</div>
        </Card>
        <Card className="p-4 flex flex-col gap-1">
          <div className="text-sm font-medium text-ink-500">Late Arrivals</div>
          <div className="text-2xl font-bold text-warning font-data">
            {attendanceList.filter(a => (a.checkInTime || '') > '09:30').length}
          </div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        {staffList.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-rice-50 text-ink-500 font-medium">
                <tr>
                  <th className="px-4 py-3">Staff Member</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Check In</th>
                  <th className="px-4 py-3">Check Out</th>
                  <th className="px-4 py-3">Total Hours</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rice-100">
                {staffList.map(user => {
                  const record = attendanceList.find(a => a.staffId === user.id);
                  const isPresent = !!record;
                  const isCheckedOut = !!record?.checkOutTime;

                  return (
                    <tr key={user.id} className="hover:bg-rice-25">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-ink-900">{user.fullName}</div>
                      </td>
                      <td className="px-4 py-3 capitalize text-ink-600">
                        {user.role.replace('_', ' ')}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={isPresent ? 'success' : 'neutral'}>
                          {isPresent ? (isCheckedOut ? 'Completed' : 'Present') : 'Absent'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-ink-600 font-data">
                        {record?.checkInTime || '-'}
                      </td>
                      <td className="px-4 py-3 text-ink-600 font-data">
                        {record?.checkOutTime || '-'}
                      </td>
                      <td className="px-4 py-3 text-ink-600 font-data font-semibold">
                        {record?.totalWorkingHours ? `${record.totalWorkingHours} hrs` : '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
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
                            <span className="text-leaf-600 flex items-center gap-1 text-sm font-semibold">
                              <CheckCircle size={14} /> Done
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8">
            <EmptyState title="No Staff Found" description="Add staff members in Staff Management first." />
          </div>
        )}
      </Card>
    </div>
  );
}
