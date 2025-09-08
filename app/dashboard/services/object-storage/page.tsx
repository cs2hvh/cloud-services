'use client';

import { motion } from "motion/react";
import { Database, Clock, Bell } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const ObjectStoragePage = () => {
  return (
    <div className="flex-1 bg-black min-h-screen p-6 sm:p-8 text-white">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-between items-center mb-8"
      >
        <div>
          <h1 className="text-3xl font-bold">Object Storage</h1>
          <p className="text-white/60">Scalable cloud storage for your files, backups, and static content.</p>
        </div>
      </motion.div>

      {/* Coming Soon Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ delay: 0.1 }}
        className="max-w-2xl mx-auto"
      >
        <Card className="bg-white/5 border-white/10 text-center">
          <CardContent className="py-16">
            <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Database className="h-10 w-10 text-blue-400" />
            </div>
            
            <h2 className="text-2xl font-bold text-white mb-4">Coming Soon</h2>
            
            <p className="text-white/60 mb-8 max-w-md mx-auto leading-relaxed">
              We&apos;re working hard to bring you a powerful Object Storage solution. 
              Store and manage your files, backups, and static content with enterprise-grade reliability and performance.
            </p>

            <div className="flex items-center justify-center gap-2 text-white/50 mb-8">
              <Clock className="h-4 w-4" />
              <span className="text-sm">Expected Launch: Q1 2026</span>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">What to Expect:</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-white/70">
                <div className="text-left">
                  <ul className="space-y-2">
                    <li>• S3-compatible API</li>
                    <li>• Global CDN integration</li>
                    <li>• Automated backups</li>
                    <li>• Version control</li>
                  </ul>
                </div>
                <div className="text-left">
                  <ul className="space-y-2">
                    <li>• 99.9% uptime SLA</li>
                    <li>• Encryption at rest</li>
                    <li>• Lifecycle policies</li>
                    <li>• Pay-as-you-use pricing</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <Button 
                className="bg-white text-black hover:bg-gray-200"
                onClick={() => {
                  // You can implement a notification signup here
                  alert('We\'ll notify you when Object Storage is available!');
                }}
              >
                <Bell className="h-4 w-4 mr-2" />
                Notify Me When Available
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Feature Preview */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ delay: 0.3 }}
        className="mt-12"
      >
        <h2 className="text-2xl font-bold text-white mb-6 text-center">Planned Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white">S3-Compatible API</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-white/60">
                Full compatibility with Amazon S3 API, making migration and integration seamless with existing tools and applications.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white">Global CDN</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-white/60">
                Built-in CDN integration for fast content delivery worldwide, perfect for static websites and media files.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white">Enterprise Security</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-white/60">
                Advanced security features including encryption at rest, access controls, and compliance with industry standards.
              </CardDescription>
            </CardContent>
          </Card>
        </div>
      </motion.div>
    </div>
  );
};

export default ObjectStoragePage;
