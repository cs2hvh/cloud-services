'use client';

import { motion } from "motion/react";
import { Database, Plus,  Search } from "lucide-react";
import Link from "next/link";

const DatabasePage = () => {
  // Dummy data for now, replace with actual data from your backend
  const databases = [];

  return (
    <div className="flex-1 bg-black min-h-screen p-6 sm:p-8 text-white">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-between items-center mb-8"
      >
        <div>
          <h1 className="text-3xl font-bold">Databases</h1>
          <p className="text-white/60">Manage and provision your database clusters.</p>
        </div>
        <Link
          href="/dashboard/services/database/new"
          className="group relative inline-flex items-center justify-center px-6 py-2.5 font-medium text-black transition-all duration-200 bg-white rounded-md hover:bg-gray-200"
        >
          <Plus className="-ml-1 mr-2 h-5 w-5" />
          New Database
        </Link>
      </motion.div>

      {databases.length > 0 ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <div className="bg-white/5 p-4 rounded-lg mb-6 flex items-center justify-between">
              <div className="flex items-center w-full max-w-md">
                  <Search className="w-5 h-5 text-white/50 mr-3"/>
                  <input 
                      type="text" 
                      placeholder="Search databases..." 
                      className="w-full bg-transparent focus:outline-none"
                  />
              </div>
              {/* Add filter button if needed */}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* This is where you would map through your databases */}
            {/* Example card:
            <div className="bg-white/5 p-6 rounded-lg">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg">production-db-1</h3>
                  <p className="text-sm text-white/60">PostgreSQL 16</p>
                </div>
                <button className="text-white/70 hover:text-white">
                  <MoreVertical size={20}/>
                </button>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium bg-green-500/10 text-green-400">Active</span>
                <p className="text-sm text-white/60">2 hours ago</p>
              </div>
            </div>
            */}
          </div>
        </motion.div>
      ) : (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-center py-20 border-2 border-dashed border-white/10 rounded-lg"
        >
          <Database className="mx-auto h-16 w-16 text-white/20" />
          <h3 className="mt-4 text-xl font-semibold">No Databases Found</h3>
          <p className="mt-2 text-sm text-white/50">Get started by provisioning a new database cluster.</p>
          <div className="mt-6">
            <Link 
              href="/dashboard/services/database/new"
              className="group relative inline-flex items-center justify-center px-5 py-2 font-medium text-black transition-all duration-200 bg-white rounded-md hover:bg-gray-200"
            >
              <Plus className="-ml-1 mr-2 h-5 w-5" />
              Create Database
            </Link>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default DatabasePage;