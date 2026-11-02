type FindFirstDelegate = {
  findFirst(args?: Record<string, unknown>): Promise<unknown>;
};

export async function existsBy(
  delegate: FindFirstDelegate,
  where: Record<string, unknown>,
): Promise<boolean> {
  return (await delegate.findFirst({ where, select: { createdAt: true } })) !== null;
}
