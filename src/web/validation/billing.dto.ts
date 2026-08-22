import { IsIn } from 'class-validator';
import type { BillingInterval } from '../../contracts';

export class StartCheckoutDto {
  @IsIn(['monthly', 'yearly'], {
    message: 'Choose either monthly or yearly billing',
  })
  interval!: BillingInterval;
}

export class BuyCreditsDto {
  @IsIn(['min30', 'min90', 'min220'], {
    message: 'Pick one of the minute bundles',
  })
  bundle!: 'min30' | 'min90' | 'min220';
}
