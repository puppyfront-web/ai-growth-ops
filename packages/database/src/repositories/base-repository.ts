export const activeByUser = (userId: string) => ({
  userId,
  deletedAt: null
});

export const softDeleteData = () => ({
  deletedAt: new Date()
});
