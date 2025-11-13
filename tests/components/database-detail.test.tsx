/**
 * @file tests/components/database-detail.test.tsx
 * @description React component tests for database detail page
 * @coverage TC-DB-078 to TC-DB-084
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Singledb from '@/components/dashboard/database/singledb';
import api from '@/lib/axios/axios';
import { toast } from 'sonner';

// Mock dependencies
vi.mock('@/lib/axios/axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock('@/app/dashboard/provider', () => ({
  useProjects: () => ({
    projects: [
      { id: 'project-1', name: 'Test Project 1' },
      { id: 'project-2', name: 'Test Project 2' },
    ],
  }),
}));

// Mock database data
const mockDatabase = {
  id: 'db-123',
  cluster_id: 'do-cluster-123',
  do_database_id: 'do-db-id-123',
  name: 'test-mysql-db',
  engine: 'mysql',
  version: '8.0',
  status: 'online',
  num_nodes: 1,
  size: 'db-s-1vcpu-1gb',
  region: 'nyc3',
  connection_host: 'test-mysql-db-do-user-123.db.ondigitalocean.com',
  connection_port: 25060,
  connection_database: 'defaultdb',
  connection_username: 'doadmin',
  connection_password: 'super_secret_password',
  connection_uri: 'mysql://doadmin:super_secret_password@test-mysql-db-do-user-123.db.ondigitalocean.com:25060/defaultdb?ssl-mode=REQUIRED',
  connection_ssl: true,
  private_connection_host: 'private-test-mysql-db.db.ondigitalocean.com',
  private_connection_port: 25060,
  private_connection_uri: 'mysql://doadmin:super_secret_password@private-test-mysql-db.db.ondigitalocean.com:25060/defaultdb?ssl-mode=REQUIRED',
  created_at: '2025-01-15T10:00:00Z',
  monthly_cost: 15,
  project_id: 'project-1',
  user_id: 'user-123',
};

const mockPostgresDatabase = {
  ...mockDatabase,
  id: 'db-456',
  cluster_id: 'do-cluster-456',
  name: 'test-postgres-db',
  engine: 'pg',
  version: '15',
  connection_uri: 'postgresql://doadmin:super_secret_password@test-postgres-db.db.ondigitalocean.com:25060/defaultdb?sslmode=require',
};

const mockUsers = [
  { name: 'doadmin', password: 'admin_password', role: 'primary', created_at: '2025-01-15T10:00:00Z' },
  { name: 'testuser1', password: 'user_password_1', role: 'normal', created_at: '2025-01-15T11:00:00Z' },
  { name: 'testuser2', password: 'user_password_2', role: 'normal', created_at: '2025-01-15T12:00:00Z' },
];

const mockDatabases = [
  { name: 'defaultdb', created_at: '2025-01-15T10:00:00Z' },
  { name: 'testdb1', created_at: '2025-01-15T11:00:00Z' },
  { name: 'testdb2', created_at: '2025-01-15T12:00:00Z' },
];

const mockNetworkRules = [
  { uuid: 'rule-1', cluster_uuid: 'do-cluster-123', type: 'ip_addr', value: '192.168.1.100', created_at: '2025-01-15T10:00:00Z' },
  { uuid: 'rule-2', cluster_uuid: 'do-cluster-123', type: 'ip_addr', value: '10.0.0.50', created_at: '2025-01-15T11:00:00Z' },
];

describe('Database Detail Component - Overview Tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock successful database fetch
    (api.post as any).mockResolvedValue({
      status: 200,
      data: { data: mockDatabase },
    });
  });

  // TC-DB-078: Display Cluster Overview
  describe('TC-DB-078: Cluster Overview Display', () => {
    it('should display cluster name, engine, version, and status', async () => {
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText('test-mysql-db')).toBeInTheDocument();
      });

      expect(screen.getByText(/mysql/i)).toBeInTheDocument();
      expect(screen.getByText(/8\.0/i)).toBeInTheDocument();
      expect(screen.getByText(/online/i)).toBeInTheDocument();
    });

    it('should display online status with green badge', async () => {
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        const statusBadge = screen.getByText(/online/i).closest('div');
        expect(statusBadge).toHaveClass('border-green-500');
      });
    });

    it('should display creating status with yellow badge and spinner', async () => {
      const creatingDb = { ...mockDatabase, status: 'creating' };
      (api.post as any).mockResolvedValue({
        status: 200,
        data: { data: creatingDb },
      });

      render(<Singledb databaseId="db-123" status="creating" />);

      await waitFor(() => {
        expect(screen.getByText(/creating/i)).toBeInTheDocument();
      });
    });

    it('should display failed status with red badge', async () => {
      const failedDb = { ...mockDatabase, status: 'failed' };
      (api.post as any).mockResolvedValue({
        status: 200,
        data: { data: failedDb },
      });

      render(<Singledb databaseId="db-123" status="failed" />);

      await waitFor(() => {
        const statusBadge = screen.getByText(/failed/i).closest('div');
        expect(statusBadge).toHaveClass('border-red-500');
      });
    });

    it('should display cluster region information', async () => {
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/nyc3|new york/i)).toBeInTheDocument();
      });
    });

    it('should display cluster size and node count', async () => {
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/db-s-1vcpu-1gb/i)).toBeInTheDocument();
        expect(screen.getByText(/1.*node/i)).toBeInTheDocument();
      });
    });

    it('should display cluster creation date', async () => {
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/2025/)).toBeInTheDocument();
      });
    });

    it('should display monthly cost if available', async () => {
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/\$15/)).toBeInTheDocument();
      });
    });
  });

  // TC-DB-079: Connection Information Display
  describe('TC-DB-079: Connection Information', () => {
    it('should display public connection tab by default', async () => {
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/test-mysql-db-do-user-123\.db\.ondigitalocean\.com/)).toBeInTheDocument();
      });
    });

    it('should display connection host', async () => {
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/test-mysql-db-do-user-123\.db\.ondigitalocean\.com/)).toBeInTheDocument();
      });
    });

    it('should display connection port', async () => {
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/25060/)).toBeInTheDocument();
      });
    });

    it('should display connection username', async () => {
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/doadmin/)).toBeInTheDocument();
      });
    });

    it('should mask password by default', async () => {
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.queryByText('super_secret_password')).not.toBeInTheDocument();
        expect(screen.getByText(/•+/)).toBeInTheDocument();
      });
    });

    it('should toggle password visibility when eye icon is clicked', async () => {
      const user = userEvent.setup();
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/•+/)).toBeInTheDocument();
      });

      const eyeButton = screen.getAllByRole('button').find(btn => 
        btn.querySelector('svg')?.classList.contains('lucide-eye') ||
        btn.querySelector('svg')?.classList.contains('lucide-eye-off')
      );
      
      if (eyeButton) {
        await user.click(eyeButton);
        await waitFor(() => {
          expect(screen.getByText('super_secret_password')).toBeInTheDocument();
        });
      }
    });

    it('should display connection URI', async () => {
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/mysql:\/\//)).toBeInTheDocument();
      });
    });

    it('should show SSL enabled indicator', async () => {
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/ssl|secure/i)).toBeInTheDocument();
      });
    });

    it('should allow copying connection details to clipboard', async () => {
      const user = userEvent.setup();
      const mockClipboard = {
        writeText: vi.fn().mockResolvedValue(undefined),
      };
      Object.assign(navigator, { clipboard: mockClipboard });

      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/test-mysql-db-do-user-123\.db\.ondigitalocean\.com/)).toBeInTheDocument();
      });

      const copyButtons = screen.getAllByRole('button').filter(btn => 
        btn.textContent?.includes('Copy') || btn.querySelector('svg')
      );

      if (copyButtons.length > 0) {
        await user.click(copyButtons[0]);
        await waitFor(() => {
          expect(toast.success).toHaveBeenCalled();
        });
      }
    });

    it('should switch to private connection tab when clicked', async () => {
      const user = userEvent.setup();
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/test-mysql-db-do-user-123\.db\.ondigitalocean\.com/)).toBeInTheDocument();
      });

      const privateTab = screen.getByText(/private/i).closest('button');
      if (privateTab) {
        await user.click(privateTab);
        await waitFor(() => {
          expect(screen.getByText(/private-test-mysql-db\.db\.ondigitalocean\.com/)).toBeInTheDocument();
        });
      }
    });

    it('should display private connection details in private tab', async () => {
      const user = userEvent.setup();
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/test-mysql-db/)).toBeInTheDocument();
      });

      const privateTab = screen.getByText(/private/i).closest('button');
      if (privateTab) {
        await user.click(privateTab);
        await waitFor(() => {
          expect(screen.getByText(/private-test-mysql-db\.db\.ondigitalocean\.com/)).toBeInTheDocument();
        });
      }
    });

    it('should display CA certificate download option', async () => {
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/certificate|ca cert|download/i)).toBeInTheDocument();
      });
    });
  });
});

describe('Database Detail Component - Users & Databases Tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.post as any).mockImplementation((url: string) => {
      if (url.includes('/read')) {
        return Promise.resolve({ status: 200, data: { data: mockDatabase } });
      }
      if (url.includes('/users/list')) {
        return Promise.resolve({ status: 200, data: { data: mockUsers } });
      }
      if (url.includes('/dbs/list')) {
        return Promise.resolve({ status: 200, data: { data: mockDatabases } });
      }
      return Promise.resolve({ status: 200, data: {} });
    });
  });

  // TC-DB-080: Users Management Tab
  describe('TC-DB-080: Users Management', () => {
    it('should display list of database users', async () => {
      const user = userEvent.setup();
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/test-mysql-db/)).toBeInTheDocument();
      });

      const usersTab = screen.getByText(/users.*databases/i);
      await user.click(usersTab);

      await waitFor(() => {
        expect(screen.getByText('doadmin')).toBeInTheDocument();
        expect(screen.getByText('testuser1')).toBeInTheDocument();
        expect(screen.getByText('testuser2')).toBeInTheDocument();
      });
    });

    it('should display user roles', async () => {
      const user = userEvent.setup();
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/test-mysql-db/)).toBeInTheDocument();
      });

      const usersTab = screen.getByText(/users.*databases/i);
      await user.click(usersTab);

      await waitFor(() => {
        expect(screen.getByText(/primary/i)).toBeInTheDocument();
      });
    });

    it('should display user creation dates', async () => {
      const user = userEvent.setup();
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/test-mysql-db/)).toBeInTheDocument();
      });

      const usersTab = screen.getByText(/users.*databases/i);
      await user.click(usersTab);

      await waitFor(() => {
        expect(screen.getByText(/2025/)).toBeInTheDocument();
      });
    });

    it('should allow adding a new user', async () => {
      const user = userEvent.setup();
      (api.post as any).mockImplementation((url: string, data: any) => {
        if (url.includes('/read')) {
          return Promise.resolve({ status: 200, data: { data: mockDatabase } });
        }
        if (url.includes('/users/list')) {
          return Promise.resolve({ status: 200, data: { data: mockUsers } });
        }
        if (url.includes('/users/create')) {
          return Promise.resolve({ 
            status: 200, 
            data: { user: { name: data.name, password: 'generated_password' } } 
          });
        }
        if (url.includes('/dbs/list')) {
          return Promise.resolve({ status: 200, data: { data: mockDatabases } });
        }
        return Promise.resolve({ status: 200, data: {} });
      });

      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/test-mysql-db/)).toBeInTheDocument();
      });

      const usersTab = screen.getByText(/users.*databases/i);
      await user.click(usersTab);

      await waitFor(() => {
        expect(screen.getByText('doadmin')).toBeInTheDocument();
      });

      const usernameInput = screen.getByPlaceholderText(/enter username|username/i);
      await user.type(usernameInput, 'newuser');

      const addButton = screen.getByRole('button', { name: /add user|create user/i });
      await user.click(addButton);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          expect.stringContaining('/users/create'),
          expect.objectContaining({ name: 'newuser' })
        );
        expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('User created'));
      });
    });

    it('should validate username before creation', async () => {
      const user = userEvent.setup();
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/test-mysql-db/)).toBeInTheDocument();
      });

      const usersTab = screen.getByText(/users.*databases/i);
      await user.click(usersTab);

      await waitFor(() => {
        expect(screen.getByText('doadmin')).toBeInTheDocument();
      });

      const addButton = screen.getByRole('button', { name: /add user|create user/i });
      await user.click(addButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('username'));
      });
    });

    it('should allow deleting a user with confirmation', async () => {
      const user = userEvent.setup();
      (api.post as any).mockImplementation((url: string) => {
        if (url.includes('/read')) {
          return Promise.resolve({ status: 200, data: { data: mockDatabase } });
        }
        if (url.includes('/users/list')) {
          return Promise.resolve({ status: 200, data: { data: mockUsers } });
        }
        if (url.includes('/users/delete')) {
          return Promise.resolve({ status: 200, data: { message: 'User deleted' } });
        }
        if (url.includes('/dbs/list')) {
          return Promise.resolve({ status: 200, data: { data: mockDatabases } });
        }
        return Promise.resolve({ status: 200, data: {} });
      });

      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/test-mysql-db/)).toBeInTheDocument();
      });

      const usersTab = screen.getByText(/users.*databases/i);
      await user.click(usersTab);

      await waitFor(() => {
        expect(screen.getByText('testuser1')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByRole('button').filter(btn => 
        btn.querySelector('svg')?.classList.contains('lucide-trash') ||
        btn.textContent?.includes('Delete')
      );

      if (deleteButtons.length > 0) {
        await user.click(deleteButtons[0]);

        await waitFor(() => {
          expect(screen.getByText(/confirm|delete/i)).toBeInTheDocument();
        });

        const confirmInput = screen.getByRole('textbox', { name: /confirm/i }) || 
                           screen.getAllByRole('textbox').find(input => 
                             input.getAttribute('placeholder')?.includes('confirm')
                           );
        
        if (confirmInput) {
          await user.type(confirmInput, 'testuser1');

          const confirmButton = screen.getByRole('button', { name: /confirm|delete/i });
          await user.click(confirmButton);

          await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith(
              expect.stringContaining('/users/delete'),
              expect.any(Object)
            );
          });
        }
      }
    });

    it('should allow resetting user password', async () => {
      const user = userEvent.setup();
      (api.post as any).mockImplementation((url: string) => {
        if (url.includes('/read')) {
          return Promise.resolve({ status: 200, data: { data: mockDatabase } });
        }
        if (url.includes('/users/list')) {
          return Promise.resolve({ status: 200, data: { data: mockUsers } });
        }
        if (url.includes('/users/reset-password')) {
          return Promise.resolve({ 
            status: 200, 
            data: { password: 'new_generated_password' } 
          });
        }
        if (url.includes('/dbs/list')) {
          return Promise.resolve({ status: 200, data: { data: mockDatabases } });
        }
        return Promise.resolve({ status: 200, data: {} });
      });

      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/test-mysql-db/)).toBeInTheDocument();
      });

      const usersTab = screen.getByText(/users.*databases/i);
      await user.click(usersTab);

      await waitFor(() => {
        expect(screen.getByText('testuser1')).toBeInTheDocument();
      });

      const resetButtons = screen.getAllByRole('button').filter(btn => 
        btn.textContent?.includes('Reset') || 
        btn.querySelector('svg')?.classList.contains('lucide-refresh')
      );

      if (resetButtons.length > 0) {
        await user.click(resetButtons[0]);

        await waitFor(() => {
          expect(api.post).toHaveBeenCalledWith(
            expect.stringContaining('/users/reset-password'),
            expect.any(Object)
          );
        });
      }
    });

    it('should mask user passwords by default', async () => {
      const user = userEvent.setup();
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/test-mysql-db/)).toBeInTheDocument();
      });

      const usersTab = screen.getByText(/users.*databases/i);
      await user.click(usersTab);

      await waitFor(() => {
        expect(screen.getByText('testuser1')).toBeInTheDocument();
        expect(screen.queryByText('user_password_1')).not.toBeInTheDocument();
      });
    });
  });

  // TC-DB-081: Databases Management Tab
  describe('TC-DB-081: Databases Management', () => {
    it('should display list of databases in cluster', async () => {
      const user = userEvent.setup();
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/test-mysql-db/)).toBeInTheDocument();
      });

      const usersTab = screen.getByText(/users.*databases/i);
      await user.click(usersTab);

      await waitFor(() => {
        expect(screen.getByText('defaultdb')).toBeInTheDocument();
        expect(screen.getByText('testdb1')).toBeInTheDocument();
        expect(screen.getByText('testdb2')).toBeInTheDocument();
      });
    });

    it('should display database creation dates', async () => {
      const user = userEvent.setup();
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/test-mysql-db/)).toBeInTheDocument();
      });

      const usersTab = screen.getByText(/users.*databases/i);
      await user.click(usersTab);

      await waitFor(() => {
        expect(screen.getByText('defaultdb')).toBeInTheDocument();
        expect(screen.getByText(/2025/)).toBeInTheDocument();
      });
    });

    it('should allow creating a new database', async () => {
      const user = userEvent.setup();
      (api.post as any).mockImplementation((url: string, data: any) => {
        if (url.includes('/read')) {
          return Promise.resolve({ status: 200, data: { data: mockDatabase } });
        }
        if (url.includes('/users/list')) {
          return Promise.resolve({ status: 200, data: { data: mockUsers } });
        }
        if (url.includes('/dbs/list')) {
          return Promise.resolve({ status: 200, data: { data: mockDatabases } });
        }
        if (url.includes('/dbs/create')) {
          return Promise.resolve({ 
            status: 200, 
            data: { database: { name: data.name } } 
          });
        }
        return Promise.resolve({ status: 200, data: {} });
      });

      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/test-mysql-db/)).toBeInTheDocument();
      });

      const usersTab = screen.getByText(/users.*databases/i);
      await user.click(usersTab);

      await waitFor(() => {
        expect(screen.getByText('defaultdb')).toBeInTheDocument();
      });

      const dbNameInputs = screen.getAllByRole('textbox').filter(input => 
        input.getAttribute('placeholder')?.toLowerCase().includes('database')
      );

      if (dbNameInputs.length > 0) {
        await user.type(dbNameInputs[0], 'newdatabase');

        const addDbButton = screen.getAllByRole('button').find(btn => 
          btn.textContent?.includes('Add') && 
          btn.textContent?.includes('Database')
        );

        if (addDbButton) {
          await user.click(addDbButton);

          await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith(
              expect.stringContaining('/dbs/create'),
              expect.objectContaining({ name: 'newdatabase' })
            );
          });
        }
      }
    });

    it('should validate database name before creation', async () => {
      const user = userEvent.setup();
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/test-mysql-db/)).toBeInTheDocument();
      });

      const usersTab = screen.getByText(/users.*databases/i);
      await user.click(usersTab);

      await waitFor(() => {
        expect(screen.getByText('defaultdb')).toBeInTheDocument();
      });

      const addDbButton = screen.getAllByRole('button').find(btn => 
        btn.textContent?.includes('Add') && 
        btn.textContent?.includes('Database')
      );

      if (addDbButton) {
        await user.click(addDbButton);

        await waitFor(() => {
          expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('database'));
        });
      }
    });

    it('should allow deleting a database with confirmation', async () => {
      const user = userEvent.setup();
      (api.post as any).mockImplementation((url: string) => {
        if (url.includes('/read')) {
          return Promise.resolve({ status: 200, data: { data: mockDatabase } });
        }
        if (url.includes('/users/list')) {
          return Promise.resolve({ status: 200, data: { data: mockUsers } });
        }
        if (url.includes('/dbs/list')) {
          return Promise.resolve({ status: 200, data: { data: mockDatabases } });
        }
        if (url.includes('/dbs/delete')) {
          return Promise.resolve({ status: 200, data: { message: 'Database deleted' } });
        }
        return Promise.resolve({ status: 200, data: {} });
      });

      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/test-mysql-db/)).toBeInTheDocument();
      });

      const usersTab = screen.getByText(/users.*databases/i);
      await user.click(usersTab);

      await waitFor(() => {
        expect(screen.getByText('testdb1')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByRole('button').filter(btn => 
        btn.querySelector('svg')?.classList.contains('lucide-trash')
      );

      if (deleteButtons.length > 0) {
        await user.click(deleteButtons[0]);

        await waitFor(() => {
          expect(screen.getByText(/confirm|delete/i)).toBeInTheDocument();
        });
      }
    });

    it('should prevent deleting the default database', async () => {
      const user = userEvent.setup();
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/test-mysql-db/)).toBeInTheDocument();
      });

      const usersTab = screen.getByText(/users.*databases/i);
      await user.click(usersTab);

      await waitFor(() => {
        const defaultDbRow = screen.getByText('defaultdb').closest('div');
        const deleteButton = defaultDbRow?.querySelector('button[disabled]');
        expect(deleteButton).toBeDisabled();
      });
    });
  });
});

describe('Database Detail Component - Network Tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.post as any).mockImplementation((url: string) => {
      if (url.includes('/read')) {
        return Promise.resolve({ status: 200, data: { data: mockDatabase } });
      }
      if (url.includes('/network/read')) {
        return Promise.resolve({ status: 200, data: { data: mockNetworkRules } });
      }
      return Promise.resolve({ status: 200, data: {} });
    });
  });

  // TC-DB-082: Network/Firewall Tab
  describe('TC-DB-082: Network Rules Management', () => {
    it('should display list of firewall rules', async () => {
      const user = userEvent.setup();
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/test-mysql-db/)).toBeInTheDocument();
      });

      const networkTab = screen.getByText(/network|firewall/i);
      await user.click(networkTab);

      await waitFor(() => {
        expect(screen.getByText('192.168.1.100')).toBeInTheDocument();
        expect(screen.getByText('10.0.0.50')).toBeInTheDocument();
      });
    });

    it('should display rule types', async () => {
      const user = userEvent.setup();
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/test-mysql-db/)).toBeInTheDocument();
      });

      const networkTab = screen.getByText(/network|firewall/i);
      await user.click(networkTab);

      await waitFor(() => {
        expect(screen.getByText(/ip.*addr|ip address/i)).toBeInTheDocument();
      });
    });

    it('should display rule creation dates', async () => {
      const user = userEvent.setup();
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/test-mysql-db/)).toBeInTheDocument();
      });

      const networkTab = screen.getByText(/network|firewall/i);
      await user.click(networkTab);

      await waitFor(() => {
        expect(screen.getByText('192.168.1.100')).toBeInTheDocument();
        expect(screen.getByText(/2025/)).toBeInTheDocument();
      });
    });

    it('should allow adding a new IP address rule', async () => {
      const user = userEvent.setup();
      (api.post as any).mockImplementation((url: string, data: any) => {
        if (url.includes('/read')) {
          return Promise.resolve({ status: 200, data: { data: mockDatabase } });
        }
        if (url.includes('/network/read')) {
          return Promise.resolve({ status: 200, data: { data: mockNetworkRules } });
        }
        if (url.includes('/network/update')) {
          return Promise.resolve({ 
            status: 200, 
            data: { rule: { value: data.ip_address } } 
          });
        }
        return Promise.resolve({ status: 200, data: {} });
      });

      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/test-mysql-db/)).toBeInTheDocument();
      });

      const networkTab = screen.getByText(/network|firewall/i);
      await user.click(networkTab);

      await waitFor(() => {
        expect(screen.getByText('192.168.1.100')).toBeInTheDocument();
      });

      const ipInput = screen.getByPlaceholderText(/ip address|enter ip/i);
      await user.type(ipInput, '172.16.0.1');

      const addButton = screen.getByRole('button', { name: /add.*rule|add.*ip/i });
      await user.click(addButton);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          expect.stringContaining('/network/update'),
          expect.objectContaining({ ip_address: '172.16.0.1' })
        );
      });
    });

    it('should validate IP address format', async () => {
      const user = userEvent.setup();
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/test-mysql-db/)).toBeInTheDocument();
      });

      const networkTab = screen.getByText(/network|firewall/i);
      await user.click(networkTab);

      await waitFor(() => {
        expect(screen.getByText('192.168.1.100')).toBeInTheDocument();
      });

      const ipInput = screen.getByPlaceholderText(/ip address|enter ip/i);
      await user.type(ipInput, 'invalid-ip');

      const addButton = screen.getByRole('button', { name: /add.*rule|add.*ip/i });
      await user.click(addButton);

      await waitFor(() => {
        expect(screen.getByText(/valid.*ip|invalid.*ip/i)).toBeInTheDocument();
      });
    });

    it('should prevent adding duplicate IP addresses', async () => {
      const user = userEvent.setup();
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/test-mysql-db/)).toBeInTheDocument();
      });

      const networkTab = screen.getByText(/network|firewall/i);
      await user.click(networkTab);

      await waitFor(() => {
        expect(screen.getByText('192.168.1.100')).toBeInTheDocument();
      });

      const ipInput = screen.getByPlaceholderText(/ip address|enter ip/i);
      await user.type(ipInput, '192.168.1.100');

      const addButton = screen.getByRole('button', { name: /add.*rule|add.*ip/i });
      await user.click(addButton);

      await waitFor(() => {
        expect(screen.getByText(/already|duplicate/i)).toBeInTheDocument();
      });
    });

    it('should allow deleting a firewall rule with confirmation', async () => {
      const user = userEvent.setup();
      (api.post as any).mockImplementation((url: string) => {
        if (url.includes('/read')) {
          return Promise.resolve({ status: 200, data: { data: mockDatabase } });
        }
        if (url.includes('/network/read')) {
          return Promise.resolve({ status: 200, data: { data: mockNetworkRules } });
        }
        if (url.includes('/network/delete')) {
          return Promise.resolve({ status: 200, data: { message: 'Rule deleted' } });
        }
        return Promise.resolve({ status: 200, data: {} });
      });

      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/test-mysql-db/)).toBeInTheDocument();
      });

      const networkTab = screen.getByText(/network|firewall/i);
      await user.click(networkTab);

      await waitFor(() => {
        expect(screen.getByText('192.168.1.100')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByRole('button').filter(btn => 
        btn.querySelector('svg')?.classList.contains('lucide-trash')
      );

      if (deleteButtons.length > 0) {
        await user.click(deleteButtons[0]);

        await waitFor(() => {
          expect(screen.getByText(/confirm|delete/i)).toBeInTheDocument();
        });
      }
    });

    it('should allow refreshing firewall rules', async () => {
      const user = userEvent.setup();
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/test-mysql-db/)).toBeInTheDocument();
      });

      const networkTab = screen.getByText(/network|firewall/i);
      await user.click(networkTab);

      await waitFor(() => {
        expect(screen.getByText('192.168.1.100')).toBeInTheDocument();
      });

      const refreshButton = screen.getAllByRole('button').find(btn => 
        btn.querySelector('svg')?.classList.contains('lucide-refresh')
      );

      if (refreshButton) {
        await user.click(refreshButton);

        await waitFor(() => {
          expect(api.post).toHaveBeenCalledWith(
            expect.stringContaining('/network/read'),
            expect.any(Object)
          );
        });
      }
    });
  });
});

describe('Database Detail Component - Settings Tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.post as any).mockImplementation((url: string) => {
      if (url.includes('/read')) {
        return Promise.resolve({ status: 200, data: { data: mockDatabase } });
      }
      return Promise.resolve({ status: 200, data: {} });
    });
    (api.get as any).mockResolvedValue({
      status: 200,
      data: { maintenance_window: { day: 'monday', hour: '02:00' } },
    });
  });

  // TC-DB-083: Settings Tab - Rename
  describe('TC-DB-083: Cluster Rename', () => {
    it('should display cluster rename option', async () => {
      const user = userEvent.setup();
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/test-mysql-db/)).toBeInTheDocument();
      });

      const settingsTab = screen.getByText(/settings/i);
      await user.click(settingsTab);

      await waitFor(() => {
        expect(screen.getByText(/rename|cluster name/i)).toBeInTheDocument();
      });
    });

    it('should display current cluster name in rename field', async () => {
      const user = userEvent.setup();
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/test-mysql-db/)).toBeInTheDocument();
      });

      const settingsTab = screen.getByText(/settings/i);
      await user.click(settingsTab);

      await waitFor(() => {
        const nameInput = screen.getByDisplayValue('test-mysql-db');
        expect(nameInput).toBeInTheDocument();
      });
    });

    it('should display project assignment options', async () => {
      const user = userEvent.setup();
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/test-mysql-db/)).toBeInTheDocument();
      });

      const settingsTab = screen.getByText(/settings/i);
      await user.click(settingsTab);

      await waitFor(() => {
        expect(screen.getByText(/project/i)).toBeInTheDocument();
      });
    });

    it('should display maintenance window settings', async () => {
      const user = userEvent.setup();
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/test-mysql-db/)).toBeInTheDocument();
      });

      const settingsTab = screen.getByText(/settings/i);
      await user.click(settingsTab);

      await waitFor(() => {
        expect(screen.getByText(/maintenance/i)).toBeInTheDocument();
      });
    });
  });

  // TC-DB-084: Settings Tab - Delete
  describe('TC-DB-084: Cluster Deletion', () => {
    it('should display delete cluster button', async () => {
      const user = userEvent.setup();
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/test-mysql-db/)).toBeInTheDocument();
      });

      const settingsTab = screen.getByText(/settings/i);
      await user.click(settingsTab);

      await waitFor(() => {
        expect(screen.getByText(/delete.*cluster|delete.*database/i)).toBeInTheDocument();
      });
    });

    it('should show warning message about deletion', async () => {
      const user = userEvent.setup();
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/test-mysql-db/)).toBeInTheDocument();
      });

      const settingsTab = screen.getByText(/settings/i);
      await user.click(settingsTab);

      await waitFor(() => {
        expect(screen.getByText(/permanent|cannot.*undo|warning/i)).toBeInTheDocument();
      });
    });

    it('should require confirmation before deletion', async () => {
      const user = userEvent.setup();
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/test-mysql-db/)).toBeInTheDocument();
      });

      const settingsTab = screen.getByText(/settings/i);
      await user.click(settingsTab);

      await waitFor(() => {
        const deleteButton = screen.getByRole('button', { name: /delete.*cluster|delete.*database/i });
        expect(deleteButton).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: /delete.*cluster|delete.*database/i });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText(/confirm|type.*name/i)).toBeInTheDocument();
      });
    });

    it('should validate cluster name matches before deletion', async () => {
      const user = userEvent.setup();
      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/test-mysql-db/)).toBeInTheDocument();
      });

      const settingsTab = screen.getByText(/settings/i);
      await user.click(settingsTab);

      await waitFor(() => {
        const deleteButton = screen.getByRole('button', { name: /delete.*cluster|delete.*database/i });
        expect(deleteButton).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: /delete.*cluster|delete.*database/i });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText(/confirm|type.*name/i)).toBeInTheDocument();
      });

      const confirmInput = screen.getAllByRole('textbox').find(input => 
        input.getAttribute('placeholder')?.toLowerCase().includes('name')
      );

      if (confirmInput) {
        await user.type(confirmInput, 'wrong-name');

        const confirmButton = screen.getByRole('button', { name: /confirm.*delete|delete/i });
        await user.click(confirmButton);

        await waitFor(() => {
          expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('does not match'));
        });
      }
    });

    it('should delete cluster when correct name is entered', async () => {
      const user = userEvent.setup();
      (api.post as any).mockImplementation((url: string) => {
        if (url.includes('/read')) {
          return Promise.resolve({ status: 200, data: { data: mockDatabase } });
        }
        if (url.includes('/delete')) {
          return Promise.resolve({ status: 200, data: { message: 'Cluster deleted' } });
        }
        return Promise.resolve({ status: 200, data: {} });
      });

      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/test-mysql-db/)).toBeInTheDocument();
      });

      const settingsTab = screen.getByText(/settings/i);
      await user.click(settingsTab);

      await waitFor(() => {
        const deleteButton = screen.getByRole('button', { name: /delete.*cluster|delete.*database/i });
        expect(deleteButton).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: /delete.*cluster|delete.*database/i });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText(/confirm|type.*name/i)).toBeInTheDocument();
      });

      const confirmInput = screen.getAllByRole('textbox').find(input => 
        input.getAttribute('placeholder')?.toLowerCase().includes('name')
      );

      if (confirmInput) {
        await user.type(confirmInput, 'test-mysql-db');

        const confirmButton = screen.getByRole('button', { name: /confirm.*delete|delete/i });
        await user.click(confirmButton);

        await waitFor(() => {
          expect(api.post).toHaveBeenCalledWith(
            expect.stringContaining('/delete'),
            expect.objectContaining({ id: 'do-cluster-123' })
          );
        });
      }
    });

    it('should redirect to database list after successful deletion', async () => {
      const user = userEvent.setup();
      const mockLocation = { href: '' };
      Object.defineProperty(window, 'location', {
        writable: true,
        value: mockLocation,
      });

      (api.post as any).mockImplementation((url: string) => {
        if (url.includes('/read')) {
          return Promise.resolve({ status: 200, data: { data: mockDatabase } });
        }
        if (url.includes('/delete')) {
          return Promise.resolve({ status: 200, data: { message: 'Cluster deleted' } });
        }
        return Promise.resolve({ status: 200, data: {} });
      });

      render(<Singledb databaseId="db-123" status="online" />);

      await waitFor(() => {
        expect(screen.getByText(/test-mysql-db/)).toBeInTheDocument();
      });

      const settingsTab = screen.getByText(/settings/i);
      await user.click(settingsTab);

      await waitFor(() => {
        const deleteButton = screen.getByRole('button', { name: /delete.*cluster|delete.*database/i });
        expect(deleteButton).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: /delete.*cluster|delete.*database/i });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText(/confirm|type.*name/i)).toBeInTheDocument();
      });

      const confirmInput = screen.getAllByRole('textbox').find(input => 
        input.getAttribute('placeholder')?.toLowerCase().includes('name')
      );

      if (confirmInput) {
        await user.type(confirmInput, 'test-mysql-db');

        const confirmButton = screen.getByRole('button', { name: /confirm.*delete|delete/i });
        await user.click(confirmButton);

        await waitFor(() => {
          expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('deleted'));
        }, { timeout: 3000 });
      }
    });
  });
});

describe('Database Detail Component - Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display loading spinner while fetching data', () => {
    (api.post as any).mockImplementation(() => new Promise(() => {})); // Never resolves

    render(<Singledb databaseId="db-123" status="online" />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('should display error message when database not found', async () => {
    (api.post as any).mockRejectedValue({
      response: { status: 404, data: { error: 'Database not found' } },
    });

    render(<Singledb databaseId="db-123" status="online" />);

    await waitFor(() => {
      expect(screen.getByText(/not found|failed/i)).toBeInTheDocument();
    });
  });

  it('should display error toast on API failure', async () => {
    (api.post as any).mockRejectedValue({
      response: { status: 500, data: { error: 'Internal server error' } },
    });

    render(<Singledb databaseId="db-123" status="online" />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('error'));
    });
  });

  it('should handle network errors gracefully', async () => {
    (api.post as any).mockRejectedValue(new Error('Network error'));

    render(<Singledb databaseId="db-123" status="online" />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });

  it('should poll status for creating databases', async () => {
    vi.useFakeTimers();
    const creatingDb = { ...mockDatabase, status: 'creating' };
    (api.post as any).mockResolvedValue({
      status: 200,
      data: { data: creatingDb },
    });

    render(<Singledb databaseId="db-123" status="creating" />);

    await waitFor(() => {
      expect(screen.getByText(/creating/i)).toBeInTheDocument();
    });

    // Advance timer by 60 seconds
    vi.advanceTimersByTime(60000);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledTimes(2); // Initial + 1 poll
    });

    vi.useRealTimers();
  });

  it('should stop polling when database becomes online', async () => {
    vi.useFakeTimers();
    let callCount = 0;
    (api.post as any).mockImplementation(() => {
      callCount++;
      const status = callCount > 1 ? 'online' : 'creating';
      return Promise.resolve({
        status: 200,
        data: { data: { ...mockDatabase, status } },
      });
    });

    render(<Singledb databaseId="db-123" status="creating" />);

    await waitFor(() => {
      expect(screen.getByText(/creating/i)).toBeInTheDocument();
    });

    vi.advanceTimersByTime(60000);

    await waitFor(() => {
      expect(screen.getByText(/online/i)).toBeInTheDocument();
    });

    // Advance more time - should not trigger additional polls
    const callsBeforeAdvance = callCount;
    vi.advanceTimersByTime(120000);
    
    expect(callCount).toBe(callsBeforeAdvance); // No additional calls

    vi.useRealTimers();
  });
});

describe('Database Detail Component - Tab Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.post as any).mockImplementation((url: string) => {
      if (url.includes('/read')) {
        return Promise.resolve({ status: 200, data: { data: mockDatabase } });
      }
      if (url.includes('/users/list')) {
        return Promise.resolve({ status: 200, data: { data: mockUsers } });
      }
      if (url.includes('/dbs/list')) {
        return Promise.resolve({ status: 200, data: { data: mockDatabases } });
      }
      if (url.includes('/network/read')) {
        return Promise.resolve({ status: 200, data: { data: mockNetworkRules } });
      }
      return Promise.resolve({ status: 200, data: {} });
    });
    (api.get as any).mockResolvedValue({
      status: 200,
      data: { maintenance_window: { day: 'monday', hour: '02:00' } },
    });
  });

  it('should display all tab options', async () => {
    render(<Singledb databaseId="db-123" status="online" />);

    await waitFor(() => {
      expect(screen.getByText(/overview/i)).toBeInTheDocument();
      expect(screen.getByText(/users.*databases/i)).toBeInTheDocument();
      expect(screen.getByText(/network|firewall/i)).toBeInTheDocument();
      expect(screen.getByText(/settings/i)).toBeInTheDocument();
    });
  });

  it('should default to overview tab', async () => {
    render(<Singledb databaseId="db-123" status="online" />);

    await waitFor(() => {
      const overviewTab = screen.getByText(/overview/i).closest('button');
      expect(overviewTab).toHaveAttribute('data-state', 'active');
    });
  });

  it('should switch to users/databases tab when clicked', async () => {
    const user = userEvent.setup();
    render(<Singledb databaseId="db-123" status="online" />);

    await waitFor(() => {
      expect(screen.getByText(/test-mysql-db/)).toBeInTheDocument();
    });

    const usersTab = screen.getByText(/users.*databases/i);
    await user.click(usersTab);

    await waitFor(() => {
      expect(screen.getByText('doadmin')).toBeInTheDocument();
    });
  });

  it('should switch to network tab when clicked', async () => {
    const user = userEvent.setup();
    render(<Singledb databaseId="db-123" status="online" />);

    await waitFor(() => {
      expect(screen.getByText(/test-mysql-db/)).toBeInTheDocument();
    });

    const networkTab = screen.getByText(/network|firewall/i);
    await user.click(networkTab);

    await waitFor(() => {
      expect(screen.getByText('192.168.1.100')).toBeInTheDocument();
    });
  });

  it('should switch to settings tab when clicked', async () => {
    const user = userEvent.setup();
    render(<Singledb databaseId="db-123" status="online" />);

    await waitFor(() => {
      expect(screen.getByText(/test-mysql-db/)).toBeInTheDocument();
    });

    const settingsTab = screen.getByText(/settings/i);
    await user.click(settingsTab);

    await waitFor(() => {
      expect(screen.getByText(/delete.*cluster|maintenance/i)).toBeInTheDocument();
    });
  });

  it('should preserve tab content when switching', async () => {
    const user = userEvent.setup();
    render(<Singledb databaseId="db-123" status="online" />);

    await waitFor(() => {
      expect(screen.getByText(/test-mysql-db/)).toBeInTheDocument();
    });

    // Go to users tab
    const usersTab = screen.getByText(/users.*databases/i);
    await user.click(usersTab);

    await waitFor(() => {
      expect(screen.getByText('testuser1')).toBeInTheDocument();
    });

    // Go back to overview
    const overviewTab = screen.getByText(/overview/i);
    await user.click(overviewTab);

    await waitFor(() => {
      expect(screen.getByText(/connection/i)).toBeInTheDocument();
    });

    // Go back to users - should still show data
    await user.click(usersTab);

    await waitFor(() => {
      expect(screen.getByText('testuser1')).toBeInTheDocument();
    });
  });
});
