// This component has been replaced by the new sidebar implementation
import React from "react";

export interface SidebarLayoutProps {
  children: React.ReactNode;
}

export const SidebarLayout: React.FC<SidebarLayoutProps> = ({ children }) => {
  return <>{children}</>;
};