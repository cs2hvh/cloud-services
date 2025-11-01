"use client";

import * as React from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getRelativeTime } from "@/lib/utils";
import { Tables } from "@/lib/supabase/types";
import * as Icons from "lucide-react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type ProjectLog = Tables<"project_logs">;

export const columns: ColumnDef<ProjectLog>[] = [
  {
    id: "event",
    header: "Event",
    cell: ({ row }) => {
      const log = row.original;
      const IconComponent =
        (Icons[log.event as keyof typeof Icons] as Icons.LucideIcon) ||
        Icons.Activity;
      return (
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
            <IconComponent className="h-4 w-4 text-primary" />
          </div>
          <p className="font-medium text-foreground">{log.text}</p>
        </div>
      );
    },
  },
  {
    id: "type",
    header: "Type",
    accessorKey: "event",
    cell: ({ row }) => {
      const eventType = row.getValue("type") as string;
      const getTypeColor = (type: string) => {
        switch (type?.toLowerCase()) {
          case "created":
          case "database":
            return "bg-green-500/20 text-green-400 border-green-500/30";
          case "updated":
          case "settings":
            return "bg-blue-500/20 text-blue-400 border-blue-500/30";
          case "deleted":
            return "bg-red-500/20 text-red-400 border-red-500/30";
          default:
            return "bg-gray-500/20 text-gray-400 border-gray-500/30";
        }
      };
      return (
        <Badge variant="outline" className={`${getTypeColor(eventType)} text-xs font-medium`}>
          {eventType}
        </Badge>
      );
    },
  },
  {
    accessorKey: "created_at",
    header: () => <p className="text-right">Time</p>,
    cell: ({ row }) => {
      const createdAt: string | null = row.getValue("created_at");
      return (
        <div className="text-right text-sm text-foreground">
          {createdAt ? getRelativeTime(createdAt) : "—"}
        </div>
      );
    },
  },
];

export function ProjectActivityTable({
  data,
}: {
  data:  Tables<"project_logs">[];
}) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  return (
    <div className="w-full space-y-4">
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="h-12 px-4">
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="hover:bg-muted/50"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="px-4">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  <div className="text-muted-foreground">
                    No activity found in this project yet.
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between px-2">
          <div className="text-sm text-muted-foreground">
            Showing {table.getState().pagination.pageIndex * 10 + 1} to{" "}
            {Math.min(
              (table.getState().pagination.pageIndex + 1) * 10,
              data.length
            )}{" "}
            of {data.length} entries
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <div className="text-sm">
              Page {table.getState().pagination.pageIndex + 1} of{" "}
              {table.getPageCount()}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
