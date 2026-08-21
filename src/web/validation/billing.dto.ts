import { IsIn } from 'class-validator';
import type { BillingInterval } from '../../contracts';

export class StartCheckoutDto {
  @IsIn(['monthly', 'yearly'], {
    message: 'Choose either monthly or yearly billing',
  })
  interval!: BillingInterval;
}
