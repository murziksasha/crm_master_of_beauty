import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const BranchId = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();
  return (
    req.headers['x-branch-id'] ||
    req.query?.branchId ||
    req.body?.branchId ||
    null
  ) as string | null;
});
