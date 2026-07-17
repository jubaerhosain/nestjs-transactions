import { TransactionalModule } from '../../src/transactional.module';

describe('TransactionalModule (internal)', () => {
  describe('forRoot', () => {
    it('produces a dynamic module wired through ClsModule.registerPlugins', () => {
      const dynamicModule = TransactionalModule.forRoot();
      expect(dynamicModule.module).toBe(TransactionalModule);
      expect(dynamicModule.imports).toHaveLength(1);
    });
  });
});
