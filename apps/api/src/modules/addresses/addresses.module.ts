import { Module } from '@nestjs/common';
import { ConsumerAuthModule } from '../identity/authentication/consumer-auth.module';
import { ConsumerAddressesController } from './api/consumer-addresses.controller';
import { ConsumerAddressesService } from './application/consumer-addresses.service';
import { AddressRepository } from './infrastructure/address.repository';

/**
 * Consumer saved-address HTTP (doc 98). JWT subject owns GET/POST/PATCH/DELETE
 * /me/addresses over the existing Address table. No geo. No checkout.
 */
@Module({
  imports: [ConsumerAuthModule],
  controllers: [ConsumerAddressesController],
  providers: [AddressRepository, ConsumerAddressesService],
  exports: [ConsumerAddressesService],
})
export class AddressesModule {}
