import { FactoryProvider } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import { TransactionalModule } from '../../src/transactional.module';

class Member {}
class Order {}

describe('TransactionalModule', () => {

  describe('forFeature', () => {
    it('registers and exports one repository provider per entity', () => {
      const dynamicModule = TransactionalModule.forFeature([Member, Order]);

      const tokens = (dynamicModule.providers as FactoryProvider[]).map((p) => p.provide);
      expect(tokens).toEqual([getRepositoryToken(Member), getRepositoryToken(Order)]);
      expect(dynamicModule.exports).toEqual(tokens);
      expect(dynamicModule.module).toBe(TransactionalModule);
    });

    it('uses named tokens for a named connection', () => {
      const dynamicModule = TransactionalModule.forFeature([Member], 'stats');
      const provider = (dynamicModule.providers as FactoryProvider[])[0];
      expect(provider.provide).toBe(getRepositoryToken(Member, 'stats'));
    });
  });

  describe('forRoot', () => {
    it('produces a dynamic module wired through ClsModule.registerPlugins', () => {
      const dynamicModule = TransactionalModule.forRoot();
      expect(dynamicModule.module).toBe(TransactionalModule);
      expect(dynamicModule.imports).toHaveLength(1);
    });
  });
});
