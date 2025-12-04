import { Admin_User, Tables } from "@/lib/supabase/types";

export interface DatabaseType {
  id: string;
  code: string;
  name: string;
  description: string;
  icon_url: string;
  versions: string[];
  available: boolean;
}

export interface UserProject {
  id: string;
  name: string;
  description?: string;
  created_at: string;
}

export interface AdminDatabaseState {
  selectedUser: string;
  selectedDb: string;
  selectedName: string;
  selectedVersion: string;
  selectedLocation: string;
  selectedDbType: string;
  versions: string[];
  selectedProject: string;
}

export interface AdminDatabaseErrors {
  user: string;
  name: string;
  location: string;
  dbType: string;
  plan: string;
  version: string;
  project: string;
}

export interface AdminDatabaseAssignProps {
  products: Tables<"products">[];
  locations: Tables<"locations">[];
  allUsers: Admin_User[];
  allProjects: Tables<"projects">[];
}

export const initialState: AdminDatabaseState = {
  selectedUser: "",
  selectedDb: "",
  selectedName: "",
  selectedVersion: "",
  selectedLocation: "",
  selectedDbType: "",
  versions: [],
  selectedProject: "",
};

export const initialErrors: AdminDatabaseErrors = {
  user: "",
  name: "",
  location: "",
  dbType: "",
  plan: "",
  version: "",
  project: "",
};