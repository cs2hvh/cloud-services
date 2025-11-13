'use client';

import { motion } from "motion/react";
import { Folder, Plus, Search } from "lucide-react";
import Link from "next/link";
import { Tables } from "@/lib/supabase/types";

const ProjectsPage = () => {
  // Dummy data for now, replace with actual data from your backend
  const projects: Tables<"projects">[] = [];

  return (
    <div className="flex-1 bg-black min-h-screen p-4 sm:p-6 lg:p-8 text-white">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 sm:mb-8"
      >
        <div className="flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold">Projects</h1>
          <p className="text-white/60 text-sm sm:text-base">Organize your services and resources.</p>
        </div>
        <Link
          href="/dashboard/projects/new"
          className="group relative inline-flex items-center justify-center w-full sm:w-auto px-4 py-2.5 sm:px-6 font-medium text-black transition-all duration-200 bg-white rounded-md hover:bg-gray-200 text-sm sm:text-base"
        >
          <Plus className="-ml-1 mr-2 h-4 w-4 sm:h-5 sm:w-5" />
          New Project
        </Link>
      </motion.div>

      {projects.length > 0 ? (
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ delay: 0.2 }}
        >
          <div className="bg-white/5 p-3 sm:p-4 rounded-lg mb-4 sm:mb-6 flex items-center justify-between">
            <div className="flex items-center w-full max-w-md">
              <Search className="w-4 h-4 sm:w-5 sm:h-5 text-white/50 mr-2 sm:mr-3"/>
              <input 
                type="text" 
                placeholder="Search projects..." 
                className="w-full bg-transparent focus:outline-none text-sm sm:text-base"
              />
            </div>
            {/* Add filter button if needed */}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {/* This is where you would map through your projects */}
            {/* Example card:
            <Link href={`/dashboard/projects/ID_HERE`}>
              <div className="bg-white/5 p-4 sm:p-6 rounded-lg hover:bg-white/10 transition-colors">
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-base sm:text-lg truncate">My Awesome Project</h3>
                    <p className="text-sm text-white/60 truncate">A short description of the project.</p>
                  </div>
                  <Folder className="w-6 h-6 sm:w-8 sm:h-8 text-blue-400 flex-shrink-0 ml-2" />
                </div>
                <div className="mt-3 sm:mt-4 flex items-center justify-between">
                  <span className="text-xs sm:text-sm text-white/60">3 Services</span>
                  <p className="text-xs sm:text-sm text-white/60">2 hours ago</p>
                </div>
              </div>
            </Link>
            */}
          </div>
        </motion.div>
      ) : (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-center py-12 sm:py-20 border-2 border-dashed border-white/10 rounded-lg mx-2 sm:mx-0"
        >
          <Folder className="mx-auto h-12 w-12 sm:h-16 sm:w-16 text-white/20" />
          <h3 className="mt-3 sm:mt-4 text-lg sm:text-xl font-semibold">No Projects Found</h3>
          <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-white/50 px-4">Get started by creating a new project.</p>
          <div className="mt-4 sm:mt-6">
            <Link 
              href="/dashboard/projects/new"
              className="group relative inline-flex items-center justify-center w-full sm:w-auto px-4 py-2 sm:px-5 font-medium text-black transition-all duration-200 bg-white rounded-md hover:bg-gray-200 text-sm sm:text-base"
            >
              <Plus className="-ml-1 mr-2 h-4 w-4" />
              Create Project
            </Link>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default ProjectsPage;