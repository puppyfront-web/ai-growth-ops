import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import { toast } from '@/components/ui/toast';

export function useToastAction<TData = unknown, TError = Error, TVariables = void>(
  options: UseMutationOptions<TData, TError, TVariables> & {
    successMessage?: string;
    errorMessage?: string;
  },
) {
  const { successMessage, errorMessage, ...mutationOptions } = options;
  return useMutation<TData, TError, TVariables>({
    ...mutationOptions,
    onSuccess: (...args) => {
      toast.success(successMessage ?? '操作成功');
      mutationOptions.onSuccess?.(...args);
    },
    onError: (...args) => {
      const err = args[0] as Error;
      toast.error(errorMessage ?? `操作失败: ${err.message}`);
      mutationOptions.onError?.(...args);
    },
  });
}
