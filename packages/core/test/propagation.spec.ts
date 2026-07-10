import { Propagation as ClsPropagation } from '@nestjs-cls/transactional';
import { Propagation } from '../src/propagation';

// Each SCREAMING_CASE member must BE the underlying @nestjs-cls value, so it is
// accepted anywhere the library expects a propagation with no casting. A wrong
// mapping for any member would silently change semantics — this pins all seven.
describe('Propagation', () => {
  it.each([
    ['REQUIRED', ClsPropagation.Required],
    ['REQUIRES_NEW', ClsPropagation.RequiresNew],
    ['NOT_SUPPORTED', ClsPropagation.NotSupported],
    ['MANDATORY', ClsPropagation.Mandatory],
    ['NEVER', ClsPropagation.Never],
    ['SUPPORTS', ClsPropagation.Supports],
    ['NESTED', ClsPropagation.Nested],
  ] as const)('%s is identical to the @nestjs-cls value', (member, clsValue) => {
    expect(Propagation[member]).toBe(clsValue);
  });

  it('exposes exactly the seven propagation modes', () => {
    expect(Object.keys(Propagation).sort()).toEqual(
      [
        'MANDATORY',
        'NESTED',
        'NEVER',
        'NOT_SUPPORTED',
        'REQUIRED',
        'REQUIRES_NEW',
        'SUPPORTS',
      ].sort(),
    );
  });
});
