import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const DatabasePage = () => {
  return (
    <div className="flex-1 bg-black min-h-screen">
      <div className="px-6 py-4">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">Database Clusters</h1>
          <p className="text-gray-400">Manage your database clusters and create new deployments</p>
        </div>
        
        <div className="mb-6">
          <Link href="/dashboard/services/database/new">
            <Button className="bg-blue-600 hover:bg-blue-700 text-white">
              Create New Database
            </Button>
          </Link>
        </div>

        <div className="border-t border-gray-800 pt-4">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Your Database Clusters</CardTitle>
              <CardDescription className="text-gray-400">
                No database clusters found. Create your first one to get started.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <p className="text-gray-500 mb-4">You haven't created any database clusters yet.</p>
                <Link href="/dashboard/services/database/new">
                  <Button variant="outline" className="border-gray-700 text-gray-300 hover:bg-gray-800">
                    Get Started
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default DatabasePage;
