import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatPrice } from "@/lib/utils";
import Image from "next/image";
import { Tables } from "@/lib/supabase/types";
import { DatabaseType, AdminDatabaseState, UserProject } from "@/lib/types/admin-database";

interface SummaryCardProps {
  state: AdminDatabaseState;
  selectedDatabase?: Tables<"products">;
  selectedLocationData?: Tables<"locations">;
  selectedDbTypeInfo?: DatabaseType;
  selectedUserData:{ email: string } | null;
  userProjects: UserProject[];
}

export const SummaryCard = ({
  state,
  selectedDatabase,
  selectedLocationData,
  selectedDbTypeInfo,
  selectedUserData,
  userProjects,
}: SummaryCardProps) => {
  const selectedProject = userProjects.find(p => p.id === state.selectedProject);

  return (
    <Card className="sticky top-8 bg-white/5 border-white/10">
      <CardHeader>
        <CardTitle className="text-white">Assignment Summary</CardTitle>
        {selectedDbTypeInfo && (
          <div className="mt-4 p-4 bg-white/5 rounded-lg flex justify-center">
            <Image
              src={selectedDbTypeInfo.icon_url}
              alt={selectedDbTypeInfo.name}
              width={60}
              height={60}
              className="object-contain"
            />
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {selectedUserData && (
          <div className="flex justify-between items-center">
            <span className="text-sm text-white/60">User:</span>
            <span className="font-medium text-white text-right">
              {selectedUserData.email}
            </span>
          </div>
        )}
        {state.selectedName && (
          <div className="flex justify-between items-center">
            <span className="text-sm text-white/60">Name:</span>
            <span className="font-medium text-white">{state.selectedName}</span>
          </div>
        )}
        {selectedDbTypeInfo && (
          <div className="flex justify-between items-center">
            <span className="text-sm text-white/60">Type:</span>
            <div className="flex items-center gap-2">
              <Image
                src={selectedDbTypeInfo.icon_url}
                alt={selectedDbTypeInfo.name}
                width={20}
                height={20}
                className="object-contain"
              />
              <span className="font-medium text-white">
                {selectedDbTypeInfo.name}
              </span>
            </div>
          </div>
        )}
        {selectedDatabase && (
          <div className="flex justify-between items-center">
            <span className="text-sm text-white/60">Plan:</span>
            <span className="font-medium text-white">
              {selectedDatabase.name}
            </span>
          </div>
        )}
        {state.selectedVersion && (
          <div className="flex justify-between items-center">
            <span className="text-sm text-white/60">Version:</span>
            <span className="font-medium text-white">
              v{state.selectedVersion}
            </span>
          </div>
        )}
        {selectedLocationData && (
          <div className="flex justify-between items-center">
            <span className="text-sm text-white/60">Location:</span>
            <div className="flex items-center gap-2">
              <Image
                src={`https://flagsapi.com/${selectedLocationData.country_code}/flat/64.png`}
                alt={selectedLocationData.city}
                width={16}
                height={12}
                className="rounded-sm"
              />
              <span className="font-medium text-white">
                {selectedLocationData.city}
              </span>
            </div>
          </div>
        )}
        {selectedProject && (
          <div className="flex justify-between items-center">
            <span className="text-sm text-white/60">Project:</span>
            <span className="font-medium text-white text-right">
              {selectedProject.name}
            </span>
          </div>
        )}
        <Separator className="bg-white/10" />
        <div className="flex justify-between items-center font-bold text-lg text-white">
          <span>Total</span>
          <span>
            {selectedDatabase
              ? selectedDatabase.price === 0 ||
                selectedDatabase.price === null
                ? "Free"
                : selectedDatabase.discount &&
                    Number(selectedDatabase.discount) > 0
                  ? `${formatPrice(selectedDatabase.price! * (1 - Number(selectedDatabase.discount) / 100))}/mo`
                  : `${formatPrice(selectedDatabase.price!)}/mo`
              : "-"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};