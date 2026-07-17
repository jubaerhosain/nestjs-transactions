// Canonical re-exports from @nestjs-cls/transactional — the single identity
// for decorators, tokens and error classes across all adapter packages.
export {
  ClsPluginTransactional,
  InjectTransaction,
  InjectTransactionHost,
  Transactional,
  TransactionAlreadyActiveError,
  TransactionHost,
  TransactionNotActiveError,
  TransactionPropagationError,
  getTransactionHostToken,
  getTransactionToken,
} from '@nestjs-cls/transactional';
export type { Transaction, TransactionalAdapter } from '@nestjs-cls/transactional';

// SCREAMING_CASE propagation surface (members are the underlying library values)
export { Propagation } from './propagation';

// Adapter-author SPI
export { createTransactionalModule } from './create-transactional-module';
export type { TransactionalModuleBaseClass } from './create-transactional-module';
export type {
  AdapterRegistration,
  TransactionalAsyncOptionsBase,
  TransactionalModuleDefinition,
  TransactionalRootOptionsBase,
} from './interfaces';
export { createTransactionAwareProxy, TRANSACTION_AWARE } from './transaction-aware-proxy';

// Transaction lifecycle hooks (typeorm-transactional parity)
export {
  runOnTransactionCommit,
  runOnTransactionComplete,
  runOnTransactionRollback,
} from './transaction-hooks';
