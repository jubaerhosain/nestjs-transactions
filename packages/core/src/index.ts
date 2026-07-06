// Canonical re-exports from @nestjs-cls/transactional — the single identity
// for decorators, tokens and error classes across all adapter packages.
export {
  ClsPluginTransactional,
  InjectTransaction,
  InjectTransactionHost,
  Propagation,
  Transactional,
  TransactionAlreadyActiveError,
  TransactionHost,
  TransactionNotActiveError,
  TransactionPropagationError,
  getTransactionHostToken,
  getTransactionToken,
} from '@nestjs-cls/transactional';
export type { Transaction, TransactionalAdapter } from '@nestjs-cls/transactional';

// Adapter-author SPI
export { createTransactionalModule } from './create-transactional-module';
export type { TransactionalModuleBaseClass } from './create-transactional-module';
export type {
  AdapterRegistration,
  TransactionalAsyncOptionsBase,
  TransactionalModuleDefinition,
  TransactionalRootOptionsBase,
} from './interfaces';
export { createTransactionAwareProxy } from './transaction-aware-proxy';
export { ConnectionRegistry } from './connection-registry';
