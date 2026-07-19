import { useQuery, useMutation } from '@tanstack/react-query';
import { accountsRepository } from '@/shared/services/firestore/accountsRepository';
import { queryKeys } from '@/shared/lib/queryKeys';

export function useAccountsDashboard(startDate: Date, endDate: Date) {
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];

  const paymentsQuery = useQuery({
    queryKey: queryKeys.accounts.payments(startStr, endStr),
    queryFn: () => accountsRepository.getPaymentsInRange(startDate, endDate),
    staleTime: 5 * 60 * 1000,
  });

  const invoicesQuery = useQuery({
    queryKey: queryKeys.accounts.invoices(startStr, endStr),
    queryFn: () => accountsRepository.getInvoicesInRange(startDate, endDate),
    staleTime: 5 * 60 * 1000,
  });

  const ordersQuery = useQuery({
    queryKey: queryKeys.accounts.orders(startStr, endStr),
    queryFn: () => accountsRepository.getOrdersInDateRange(startStr, endStr),
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = paymentsQuery.isLoading || invoicesQuery.isLoading || ordersQuery.isLoading;
  const isError = paymentsQuery.isError || invoicesQuery.isError || ordersQuery.isError;

  return {
    payments: paymentsQuery.data || [],
    invoices: invoicesQuery.data || [],
    orders: ordersQuery.data || [],
    isLoading,
    isError,
  };
}

export function useGenerateDailyReport() {
  return useMutation({
    mutationFn: (date: string) => accountsRepository.generateDailyReport(date),
  });
}

export function useGenerateMonthlyReport() {
  return useMutation({
    mutationFn: (month: string) => accountsRepository.generateMonthlyReport(month),
  });
}

export function useGenerateInvoice() {
  return useMutation({
    mutationFn: (payload: { customerId: string; amount: number; description: string }) => 
      accountsRepository.generateInvoice(payload),
  });
}
