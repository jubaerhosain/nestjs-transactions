import { DataSource } from 'typeorm';
import { resolveConnection } from '../../src/interfaces';

describe('resolveConnection', () => {
  it('returns both undefined for no argument (default connection)', () => {
    expect(resolveConnection()).toEqual({ connectionName: undefined, dataSource: undefined });
  });

  it('string form sets both connectionName and dataSource', () => {
    expect(resolveConnection('stats')).toEqual({ connectionName: 'stats', dataSource: 'stats' });
  });

  it('defaults dataSource from connectionName', () => {
    expect(resolveConnection({ connectionName: 'stats' })).toEqual({
      connectionName: 'stats',
      dataSource: 'stats',
    });
  });

  it('defaults connectionName from a string dataSource', () => {
    expect(resolveConnection({ dataSource: 'stats' })).toEqual({
      connectionName: 'stats',
      dataSource: 'stats',
    });
  });

  it("maps the 'default' data source name to the default connection", () => {
    expect(resolveConnection({ dataSource: 'default' })).toEqual({
      connectionName: undefined,
      dataSource: 'default',
    });
  });

  it('derives connectionName from DataSourceOptions.name', () => {
    const options = { type: 'postgres' as const, name: 'stats' };
    expect(resolveConnection({ dataSource: options })).toMatchObject({ connectionName: 'stats' });
  });

  it('derives connectionName from a DataSource instance name', () => {
    const dataSource = new DataSource({ type: 'postgres', name: 'stats' });
    expect(resolveConnection({ dataSource })).toMatchObject({ connectionName: 'stats' });
  });

  it('explicit connectionName wins over the derived one', () => {
    expect(resolveConnection({ connectionName: 'reporting', dataSource: 'stats' })).toEqual({
      connectionName: 'reporting',
      dataSource: 'stats',
    });
  });
});
