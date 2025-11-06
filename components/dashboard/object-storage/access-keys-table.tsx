"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Eye, EyeOff, Key, Calendar } from "lucide-react";
import { ObjectSpaceBucket } from "@/lib/supabase/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface AccessKeysTableProps {
  buckets: ObjectSpaceBucket[];
}

const AccessKeysTable = ({ buckets }: AccessKeysTableProps) => {
  const [visibleKeys, setVisibleKeys] = useState<{ [key: string]: { accessKey: boolean; secretKey: boolean } }>({});

  // Filter buckets that have access keys
  const bucketsWithKeys = buckets.filter(bucket => bucket.key_id && bucket.secret_key);

  const toggleKeyVisibility = (bucketId: string, keyType: 'accessKey' | 'secretKey') => {
    setVisibleKeys(prev => ({
      ...prev,
      [bucketId]: {
        ...prev[bucketId],
        [keyType]: !prev[bucketId]?.[keyType]
      }
    }));
  };

  const maskKey = (key: string) => {
    if (!key) return '';
    if (key.length <= 8) return '••••••••';
    return key.substring(0, 4) + '••••••••••••' + key.substring(key.length - 4);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (bucketsWithKeys.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/5 border border-white/10 rounded-lg p-12 text-center"
      >
        <Key className="h-16 w-16 mx-auto mb-4 text-white/40" />
        <h3 className="text-xl font-semibold mb-2">No Access Keys Found</h3>
        <p className="text-white/60 max-w-md mx-auto">
          Access keys are automatically created when you create a new bucket. 
          Create a bucket to generate dedicated access keys.
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/5 border border-white/10 rounded-lg overflow-hidden"
    >
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-white/5">
              <TableHead className="text-white/80">Bucket Name</TableHead>
              <TableHead className="text-white/80">Access Key ID</TableHead>
              <TableHead className="text-white/80">Secret Access Key</TableHead>
              <TableHead className="text-white/80">Created At</TableHead>
              <TableHead className="text-white/80">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bucketsWithKeys.map((bucket) => (
              <TableRow key={bucket.id} className="border-white/10 hover:bg-white/5">
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                      <Key className="h-4 w-4 text-blue-400" />
                    </div>
                    {bucket.name}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <code className="text-sm bg-black/30 px-3 py-1.5 rounded font-mono">
                      {visibleKeys[bucket.id]?.accessKey 
                        ? bucket.key_id 
                        : maskKey(bucket.key_id || '')}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 hover:bg-white/10"
                      onClick={() => toggleKeyVisibility(bucket.id, 'accessKey')}
                    >
                      {visibleKeys[bucket.id]?.accessKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <code className="text-sm bg-black/30 px-3 py-1.5 rounded font-mono">
                      {visibleKeys[bucket.id]?.secretKey 
                        ? bucket.secret_key 
                        : maskKey(bucket.secret_key || '')}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 hover:bg-white/10"
                      onClick={() => toggleKeyVisibility(bucket.id, 'secretKey')}
                    >
                      {visibleKeys[bucket.id]?.secretKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 text-white/60">
                    <Calendar className="h-4 w-4" />
                    <span className="text-sm">{formatDate(bucket.created_at)}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge 
                    variant={bucket.status === 'active' ? 'default' : 'secondary'}
                    className={
                      bucket.status === 'active' 
                        ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' 
                        : 'bg-yellow-500/20 text-yellow-400'
                    }
                  >
                    {bucket.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      
      <div className="px-6 py-4 border-t border-white/10 bg-white/5">
        <div className="flex items-center gap-2 text-sm text-white/60">
          <Key className="h-4 w-4" />
          <span>
            Showing {bucketsWithKeys.length} access key{bucketsWithKeys.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </motion.div>
  );
};

export default AccessKeysTable;
