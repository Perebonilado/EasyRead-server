import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'easyread:public';

/** Opts an endpoint out of the global `AuthGuard`. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
