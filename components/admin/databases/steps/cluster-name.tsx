import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronLeft, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AdminDatabaseState, AdminDatabaseErrors } from "@/lib/types/admin-database";

interface ClusterNameStepProps {
  state: AdminDatabaseState;
  setState: (state: AdminDatabaseState) => void;
  errors: AdminDatabaseErrors;
  setErrors: (errors: AdminDatabaseErrors) => void;
  onNext: () => void;
  onPrev: () => void;
}

export const ClusterNameStep = ({
  state,
  setState,
  errors,
  setErrors,
  onNext,
  onPrev,
}: ClusterNameStepProps) => {
  return (
    <Card className="bg-white/5 border-white/10">
      <CardHeader>
        <CardTitle className="text-white">Database Cluster Name</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Input
            placeholder="my-database-cluster"
            value={state.selectedName}
            onChange={(e) => {
              setState({ ...state, selectedName: e.target.value.toLowerCase() });
              // Clear error on change
              if (errors.name) {
                setErrors({ ...errors, name: "" });
              }
            }}
            className="bg-neutral-900 border-neutral-800 text-white placeholder:text-neutral-500 focus:border-neutral-700 focus:ring-0"
          />
          {errors.name && (
            <div className="flex items-center gap-2 text-red-500 text-sm">
              <AlertCircle className="w-4 h-4" />
              <span>{errors.name}</span>
            </div>
          )}
          <p className="text-xs text-white/50">
            Must be 3-63 characters, lowercase letters, numbers, and hyphens only. 
            Must start and end with alphanumeric.
          </p>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button
          variant="outline"
          onClick={onPrev}
          className="cursor-pointer rounded-md border-white/20 text-white hover:bg-white/10"
        >
          <ChevronLeft size={16} className="mr-2" /> Back
        </Button>
        <Button
          onClick={onNext}
          className="bg-white text-black rounded-md hover:bg-gray-200"
        >
          Next <ChevronRight size={16} className="ml-2" />
        </Button>
      </CardFooter>
    </Card>
  );
};