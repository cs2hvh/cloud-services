import { describe, it, expect } from 'vitest';
import { resolveConnectionTemplate } from '@/lib/templates/operations/connection-resolver';

describe('resolveConnectionTemplate', () => {
  const serviceEnv = {
    POSTGRES_USER: 'app',
    POSTGRES_PASSWORD: 's3cret',
    POSTGRES_DB: 'appdb',
  };

  it('resolves {{host}} and {{port}} placeholders', () => {
    const vars = [{ key: 'DB_URL', template: 'postgresql://{{host}}:{{port}}/app' }];
    const result = resolveConnectionTemplate(vars, serviceEnv, 'db.ns.svc', 5432);
    expect(result).toEqual([{ key: 'DB_URL', value: 'postgresql://db.ns.svc:5432/app' }]);
  });

  it('resolves env var placeholders', () => {
    const vars = [{ key: 'DB_URL', template: 'postgresql://{{POSTGRES_USER}}:{{POSTGRES_PASSWORD}}@{{host}}:{{port}}/{{POSTGRES_DB}}' }];
    const result = resolveConnectionTemplate(vars, serviceEnv, 'db.ns.svc', 5432);
    expect(result).toEqual([{
      key: 'DB_URL',
      value: 'postgresql://app:s3cret@db.ns.svc:5432/appdb',
    }]);
  });

  it('resolves multiple vars independently', () => {
    const vars = [
      { key: 'DB_HOST', template: '{{host}}' },
      { key: 'DB_PORT', template: '{{port}}' },
      { key: 'DB_USER', template: '{{POSTGRES_USER}}' },
    ];
    const result = resolveConnectionTemplate(vars, serviceEnv, 'db.ns.svc', 5432);
    expect(result).toEqual([
      { key: 'DB_HOST', value: 'db.ns.svc' },
      { key: 'DB_PORT', value: '5432' },
      { key: 'DB_USER', value: 'app' },
    ]);
  });

  it('returns empty array for empty vars input', () => {
    const result = resolveConnectionTemplate([], serviceEnv, 'host', 5432);
    expect(result).toEqual([]);
  });

  it('passes through literal text without placeholders', () => {
    const vars = [{ key: 'DB_SSL', template: 'require' }];
    const result = resolveConnectionTemplate(vars, serviceEnv, 'host', 5432);
    expect(result).toEqual([{ key: 'DB_SSL', value: 'require' }]);
  });

  it('throws when an env placeholder cannot be resolved', () => {
    const vars = [{ key: 'DB_URL', template: 'postgresql://{{MISSING_VAR}}@{{host}}/app' }];
    expect(() => resolveConnectionTemplate(vars, serviceEnv, 'host', 5432)).toThrow(
      /unresolvable/i,
    );
  });

  it('throws mentioning the unresolved placeholder in the error', () => {
    const vars = [{ key: 'DB_URL', template: '{{MISSING_VAR}}' }];
    expect(() => resolveConnectionTemplate(vars, {}, 'host', 5432)).toThrow(
      /MISSING_VAR/,
    );
  });

  it('converts port to string in output', () => {
    const vars = [{ key: 'PORT', template: '{{port}}' }];
    const result = resolveConnectionTemplate(vars, {}, 'host', 3306);
    expect(result[0].value).toBe('3306');
  });
});
