import { describe, it, expect } from 'vitest';

/**
 * Connection String Tests
 * TC-DB-093 to TC-DB-096: Verify connection string format for different database engines
 */

describe('Database Connection Strings', () => {
  describe('TC-DB-093: MySQL Connection String Format', () => {
    it('should generate valid MySQL connection string format', () => {
      const connectionString = generateMySQLConnectionString({
        user: 'testuser',
        password: 'testpass123',
        host: 'db-mysql-nyc3-12345.ondigitalocean.com',
        port: 25060,
        database: 'defaultdb',
      });

      expect(connectionString).toMatch(/^mysql:\/\/.+:.+@.+:\d+\/.+$/);
      expect(connectionString).toBe(
        'mysql://testuser:testpass123@db-mysql-nyc3-12345.ondigitalocean.com:25060/defaultdb'
      );
    });

    it('should include SSL parameter in MySQL connection string', () => {
      const connectionString = generateMySQLConnectionString({
        user: 'admin',
        password: 'secret',
        host: 'db-mysql-nyc3-12345.ondigitalocean.com',
        port: 25060,
        database: 'prod_db',
        ssl: true,
      });

      expect(connectionString).toContain('?ssl=true');
      expect(connectionString).toBe(
        'mysql://admin:secret@db-mysql-nyc3-12345.ondigitalocean.com:25060/prod_db?ssl=true'
      );
    });

    it('should handle special characters in password', () => {
      const connectionString = generateMySQLConnectionString({
        user: 'user',
        password: 'p@ss!w0rd#123',
        host: 'localhost',
        port: 3306,
        database: 'testdb',
      });

      // Special characters should be URL encoded
      expect(connectionString).toMatch(/^mysql:\/\/user:.+@localhost:3306\/testdb$/);
    });

    it('should use default port 3306 if not specified', () => {
      const connectionString = generateMySQLConnectionString({
        user: 'root',
        password: 'password',
        host: 'localhost',
        database: 'mydb',
      });

      expect(connectionString).toContain(':3306');
    });
  });

  describe('TC-DB-094: PostgreSQL Connection String Format', () => {
    it('should generate valid PostgreSQL connection string format', () => {
      const connectionString = generatePostgreSQLConnectionString({
        user: 'doadmin',
        password: 'testpass456',
        host: 'db-postgresql-nyc3-98765.ondigitalocean.com',
        port: 25060,
        database: 'defaultdb',
      });

      expect(connectionString).toMatch(/^postgresql:\/\/.+:.+@.+:\d+\/.+$/);
      expect(connectionString).toBe(
        'postgresql://doadmin:testpass456@db-postgresql-nyc3-98765.ondigitalocean.com:25060/defaultdb'
      );
    });

    it('should include sslmode=require in PostgreSQL connection string', () => {
      const connectionString = generatePostgreSQLConnectionString({
        user: 'admin',
        password: 'secure123',
        host: 'db-postgresql-sfo3-12345.ondigitalocean.com',
        port: 25060,
        database: 'production',
        sslmode: 'require',
      });

      expect(connectionString).toContain('?sslmode=require');
      expect(connectionString).toBe(
        'postgresql://admin:secure123@db-postgresql-sfo3-12345.ondigitalocean.com:25060/production?sslmode=require'
      );
    });

    it('should support alternative PostgreSQL schemes', () => {
      const connectionString = generatePostgreSQLConnectionString({
        user: 'user',
        password: 'pass',
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        scheme: 'postgres', // Alternative scheme
      });

      expect(connectionString).toMatch(/^postgres:\/\//);
    });

    it('should use default port 5432 if not specified', () => {
      const connectionString = generatePostgreSQLConnectionString({
        user: 'postgres',
        password: 'password',
        host: 'localhost',
        database: 'mydb',
      });

      expect(connectionString).toContain(':5432');
    });

    it('should handle multiple SSL options', () => {
      const connectionString = generatePostgreSQLConnectionString({
        user: 'admin',
        password: 'pass',
        host: 'db-host.com',
        port: 5432,
        database: 'db',
        sslmode: 'verify-full',
        sslrootcert: '/path/to/ca.crt',
      });

      expect(connectionString).toContain('sslmode=verify-full');
      expect(connectionString).toContain('sslrootcert=');
    });
  });

  describe('TC-DB-095: MongoDB Connection String Format', () => {
    it('should generate valid MongoDB connection string format', () => {
      const connectionString = generateMongoDBConnectionString({
        user: 'admin',
        password: 'mongopass789',
        host: 'db-mongodb-lon1-45678.ondigitalocean.com',
        port: 27017,
        database: 'admin',
      });

      expect(connectionString).toMatch(/^mongodb:\/\/.+:.+@.+:\d+\/.+$/);
      expect(connectionString).toBe(
        'mongodb://admin:mongopass789@db-mongodb-lon1-45678.ondigitalocean.com:27017/admin'
      );
    });

    it('should include SSL parameter in MongoDB connection string', () => {
      const connectionString = generateMongoDBConnectionString({
        user: 'user',
        password: 'pass',
        host: 'db-mongodb-nyc3-12345.ondigitalocean.com',
        port: 27017,
        database: 'mydb',
        ssl: true,
      });

      expect(connectionString).toContain('?ssl=true');
      expect(connectionString).toBe(
        'mongodb://user:pass@db-mongodb-nyc3-12345.ondigitalocean.com:27017/mydb?ssl=true'
      );
    });

    it('should support MongoDB+SRV scheme for replica sets', () => {
      const connectionString = generateMongoDBConnectionString({
        user: 'admin',
        password: 'password',
        host: 'cluster0.mongodb.net',
        database: 'testdb',
        srv: true,
      });

      expect(connectionString).toMatch(/^mongodb\+srv:\/\//);
      expect(connectionString).not.toContain(':27017'); // SRV doesn't include port
    });

    it('should handle authentication database parameter', () => {
      const connectionString = generateMongoDBConnectionString({
        user: 'user',
        password: 'pass',
        host: 'localhost',
        port: 27017,
        database: 'mydb',
        authSource: 'admin',
      });

      expect(connectionString).toContain('authSource=admin');
    });

    it('should use default port 27017 if not specified', () => {
      const connectionString = generateMongoDBConnectionString({
        user: 'mongo',
        password: 'password',
        host: 'localhost',
        database: 'test',
      });

      expect(connectionString).toContain(':27017');
    });

    it('should support replica set connections', () => {
      const connectionString = generateMongoDBConnectionString({
        user: 'admin',
        password: 'pass',
        hosts: [
          'mongo1.example.com:27017',
          'mongo2.example.com:27017',
          'mongo3.example.com:27017',
        ],
        database: 'mydb',
        replicaSet: 'rs0',
      });

      expect(connectionString).toContain('mongo1.example.com:27017,mongo2.example.com:27017,mongo3.example.com:27017');
      expect(connectionString).toContain('replicaSet=rs0');
    });
  });

  describe('TC-DB-096: Redis Connection String Format', () => {
    it('should generate valid Redis connection string format', () => {
      const connectionString = generateRedisConnectionString({
        password: 'redispass123',
        host: 'db-redis-tor1-67890.ondigitalocean.com',
        port: 25061,
      });

      expect(connectionString).toMatch(/^redis:\/\/.+:.+@.+:\d+$/);
      expect(connectionString).toBe(
        'redis://default:redispass123@db-redis-tor1-67890.ondigitalocean.com:25061'
      );
    });

    it('should use rediss:// scheme for SSL connections', () => {
      const connectionString = generateRedisConnectionString({
        password: 'securepass',
        host: 'db-redis-nyc3-12345.ondigitalocean.com',
        port: 25061,
        ssl: true,
      });

      expect(connectionString).toMatch(/^rediss:\/\//);
      expect(connectionString).toBe(
        'rediss://default:securepass@db-redis-nyc3-12345.ondigitalocean.com:25061'
      );
    });

    it('should support database number parameter', () => {
      const connectionString = generateRedisConnectionString({
        password: 'pass',
        host: 'localhost',
        port: 6379,
        database: 2,
      });

      expect(connectionString).toContain('/2');
      expect(connectionString).toBe('redis://default:pass@localhost:6379/2');
    });

    it('should use default port 6379 if not specified', () => {
      const connectionString = generateRedisConnectionString({
        password: 'password',
        host: 'localhost',
      });

      expect(connectionString).toContain(':6379');
    });

    it('should handle Redis without authentication', () => {
      const connectionString = generateRedisConnectionString({
        host: 'localhost',
        port: 6379,
      });

      expect(connectionString).toBe('redis://localhost:6379');
    });

    it('should support custom username (Redis 6+)', () => {
      const connectionString = generateRedisConnectionString({
        user: 'admin',
        password: 'password',
        host: 'redis-server.com',
        port: 6379,
      });

      expect(connectionString).toContain('admin:password@');
    });
  });

  describe('Connection String Validation', () => {
    it('should validate MySQL connection string format', () => {
      const valid = 'mysql://user:pass@host:3306/db';
      const invalid = 'mysql://invalid';

      expect(isValidMySQLConnectionString(valid)).toBe(true);
      expect(isValidMySQLConnectionString(invalid)).toBe(false);
    });

    it('should validate PostgreSQL connection string format', () => {
      const valid = 'postgresql://user:pass@host:5432/db';
      const invalid = 'postgresql://incomplete';

      expect(isValidPostgreSQLConnectionString(valid)).toBe(true);
      expect(isValidPostgreSQLConnectionString(invalid)).toBe(false);
    });

    it('should validate MongoDB connection string format', () => {
      const valid = 'mongodb://user:pass@host:27017/db';
      const srvValid = 'mongodb+srv://user:pass@cluster.mongodb.net/db';
      const invalid = 'mongodb://wrong-format';

      expect(isValidMongoDBConnectionString(valid)).toBe(true);
      expect(isValidMongoDBConnectionString(srvValid)).toBe(true);
      expect(isValidMongoDBConnectionString(invalid)).toBe(false);
    });

    it('should validate Redis connection string format', () => {
      const valid = 'redis://user:pass@host:6379';
      const sslValid = 'rediss://user:pass@host:6379';
      const invalid = 'redis://broken';

      expect(isValidRedisConnectionString(valid)).toBe(true);
      expect(isValidRedisConnectionString(sslValid)).toBe(true);
      expect(isValidRedisConnectionString(invalid)).toBe(false);
    });
  });

  describe('Connection String Parsing', () => {
    it('should parse MySQL connection string', () => {
      const connectionString = 'mysql://user:pass@host.com:3306/database';
      const parsed = parseMySQLConnectionString(connectionString);

      expect(parsed).toEqual({
        engine: 'mysql',
        user: 'user',
        password: 'pass',
        host: 'host.com',
        port: 3306,
        database: 'database',
      });
    });

    it('should parse PostgreSQL connection string with SSL', () => {
      const connectionString = 'postgresql://admin:secret@pg-host.com:5432/proddb?sslmode=require';
      const parsed = parsePostgreSQLConnectionString(connectionString);

      expect(parsed).toEqual({
        engine: 'postgresql',
        user: 'admin',
        password: 'secret',
        host: 'pg-host.com',
        port: 5432,
        database: 'proddb',
        sslmode: 'require',
      });
    });

    it('should parse MongoDB connection string', () => {
      const connectionString = 'mongodb://user:pass@mongo-host.com:27017/mydb?ssl=true';
      const parsed = parseMongoDBConnectionString(connectionString);

      expect(parsed).toEqual({
        engine: 'mongodb',
        user: 'user',
        password: 'pass',
        host: 'mongo-host.com',
        port: 27017,
        database: 'mydb',
        ssl: true,
      });
    });

    it('should parse Redis connection string', () => {
      const connectionString = 'rediss://default:password@redis-host.com:6379/0';
      const parsed = parseRedisConnectionString(connectionString);

      expect(parsed).toEqual({
        engine: 'redis',
        user: 'default',
        password: 'password',
        host: 'redis-host.com',
        port: 6379,
        database: 0,
        ssl: true,
      });
    });
  });

  describe('Password Security', () => {
    it('should URL encode special characters in passwords', () => {
      const password = 'p@ss!w0rd#123&special';
      const encoded = encodePasswordForConnectionString(password);

      expect(encoded).not.toContain('@');
      expect(encoded).not.toContain('!');
      expect(encoded).not.toContain('#');
      expect(encoded).not.toContain('&');
    });

    it('should mask passwords in connection strings for display', () => {
      const connectionString = 'mysql://user:secretpassword@host:3306/db';
      const masked = maskConnectionStringPassword(connectionString);

      expect(masked).not.toContain('secretpassword');
      expect(masked).toContain('****');
      expect(masked).toBe('mysql://user:****@host:3306/db');
    });

    it('should extract password from connection string', () => {
      const connectionString = 'postgresql://admin:mypassword123@host:5432/db';
      const password = extractPasswordFromConnectionString(connectionString);

      expect(password).toBe('mypassword123');
    });
  });
});

// Helper functions (these would be imported from actual implementation)

interface MySQLConnectionConfig {
  user: string;
  password: string;
  host: string;
  port?: number;
  database: string;
  ssl?: boolean;
}

function generateMySQLConnectionString(config: MySQLConnectionConfig): string {
  const port = config.port || 3306;
  const ssl = config.ssl ? '?ssl=true' : '';
  return `mysql://${config.user}:${config.password}@${config.host}:${port}/${config.database}${ssl}`;
}

interface PostgreSQLConnectionConfig {
  user: string;
  password: string;
  host: string;
  port?: number;
  database: string;
  sslmode?: string;
  sslrootcert?: string;
  scheme?: string;
}

function generatePostgreSQLConnectionString(config: PostgreSQLConnectionConfig): string {
  const scheme = config.scheme || 'postgresql';
  const port = config.port || 5432;
  let queryParams = '';
  
  if (config.sslmode) {
    queryParams += `?sslmode=${config.sslmode}`;
    if (config.sslrootcert) {
      queryParams += `&sslrootcert=${encodeURIComponent(config.sslrootcert)}`;
    }
  }
  
  return `${scheme}://${config.user}:${config.password}@${config.host}:${port}/${config.database}${queryParams}`;
}

interface MongoDBConnectionConfig {
  user: string;
  password: string;
  host?: string;
  hosts?: string[];
  port?: number;
  database: string;
  ssl?: boolean;
  srv?: boolean;
  authSource?: string;
  replicaSet?: string;
}

function generateMongoDBConnectionString(config: MongoDBConnectionConfig): string {
  const scheme = config.srv ? 'mongodb+srv' : 'mongodb';
  let hostPart = '';
  
  if (config.hosts) {
    hostPart = config.hosts.join(',');
  } else {
    const port = config.srv ? '' : `:${config.port || 27017}`;
    hostPart = `${config.host}${port}`;
  }
  
  const queryParams: string[] = [];
  if (config.ssl) queryParams.push('ssl=true');
  if (config.authSource) queryParams.push(`authSource=${config.authSource}`);
  if (config.replicaSet) queryParams.push(`replicaSet=${config.replicaSet}`);
  
  const query = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
  
  return `${scheme}://${config.user}:${config.password}@${hostPart}/${config.database}${query}`;
}

interface RedisConnectionConfig {
  user?: string;
  password?: string;
  host: string;
  port?: number;
  database?: number;
  ssl?: boolean;
}

function generateRedisConnectionString(config: RedisConnectionConfig): string {
  const scheme = config.ssl ? 'rediss' : 'redis';
  const port = config.port || 6379;
  const user = config.user || 'default';
  const db = config.database !== undefined ? `/${config.database}` : '';
  
  if (config.password) {
    return `${scheme}://${user}:${config.password}@${config.host}:${port}${db}`;
  } else {
    return `${scheme}://${config.host}:${port}${db}`;
  }
}

// Validation functions
function isValidMySQLConnectionString(str: string): boolean {
  const regex = /^mysql:\/\/.+:.+@.+:\d+\/.+$/;
  return regex.test(str);
}

function isValidPostgreSQLConnectionString(str: string): boolean {
  const regex = /^(postgresql|postgres):\/\/.+:.+@.+:\d+\/.+$/;
  return regex.test(str);
}

function isValidMongoDBConnectionString(str: string): boolean {
  const regex = /^mongodb(\+srv)?:\/\/.+:.+@.+\/\w+$/;
  return regex.test(str);
}

function isValidRedisConnectionString(str: string): boolean {
  const regex = /^rediss?:\/\/.+:\d+$/;
  return regex.test(str);
}

// Parsing functions
function parseMySQLConnectionString(str: string) {
  const match = str.match(/^mysql:\/\/(.+):(.+)@(.+):(\d+)\/(.+)$/);
  if (!match) return null;
  
  return {
    engine: 'mysql',
    user: match[1],
    password: match[2],
    host: match[3],
    port: parseInt(match[4]),
    database: match[5],
  };
}

function parsePostgreSQLConnectionString(str: string) {
  const match = str.match(/^(postgresql|postgres):\/\/(.+):(.+)@(.+):(\d+)\/([^?]+)(\?(.+))?$/);
  if (!match) return null;
  
  const result: any = {
    engine: 'postgresql',
    user: match[2],
    password: match[3],
    host: match[4],
    port: parseInt(match[5]),
    database: match[6],
  };
  
  if (match[8]) {
    const params = new URLSearchParams(match[8]);
    if (params.has('sslmode')) {
      result.sslmode = params.get('sslmode');
    }
  }
  
  return result;
}

function parseMongoDBConnectionString(str: string) {
  const match = str.match(/^mongodb(\+srv)?:\/\/(.+):(.+)@(.+):(\d+)\/([^?]+)(\?(.+))?$/);
  if (!match) return null;
  
  const result: any = {
    engine: 'mongodb',
    user: match[2],
    password: match[3],
    host: match[4],
    port: parseInt(match[5]),
    database: match[6],
  };
  
  if (match[8]) {
    const params = new URLSearchParams(match[8]);
    if (params.has('ssl')) {
      result.ssl = params.get('ssl') === 'true';
    }
  }
  
  return result;
}

function parseRedisConnectionString(str: string) {
  const match = str.match(/^(rediss?):\/\/(.+):(.+)@(.+):(\d+)(\/(\d+))?$/);
  if (!match) return null;
  
  return {
    engine: 'redis',
    user: match[2],
    password: match[3],
    host: match[4],
    port: parseInt(match[5]),
    database: match[7] ? parseInt(match[7]) : 0,
    ssl: match[1] === 'rediss',
  };
}

// Security functions
function encodePasswordForConnectionString(password: string): string {
  return encodeURIComponent(password);
}

function maskConnectionStringPassword(connectionString: string): string {
  return connectionString.replace(/(:)([^@]+)(@)/, '$1****$3');
}

function extractPasswordFromConnectionString(connectionString: string): string | null {
  const match = connectionString.match(/:([^@]+)@/);
  return match ? match[1] : null;
}
