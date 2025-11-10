import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronLeft, AlertCircle } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";
import { Tables } from "@/lib/supabase/types";
import { AdminDatabaseState, AdminDatabaseErrors } from "@/lib/types/admin-database";

interface LocationStepProps {
  state: AdminDatabaseState;
  setState: (state: AdminDatabaseState) => void;
  errors: AdminDatabaseErrors;
  setErrors: (errors: AdminDatabaseErrors) => void;
  locations: Tables<"locations">[];
  onNext: () => void;
  onPrev: () => void;
}

export const LocationStep = ({
  state,
  setState,
  errors,
  setErrors,
  locations,
  onNext,
  onPrev,
}: LocationStepProps) => {
  return (
    <Card className="bg-white/5 border-white/10">
      <CardHeader>
        <CardTitle className="text-white">Location</CardTitle>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={state.selectedLocation}
          onValueChange={(value) => {
            setState({ ...state, selectedLocation: value });
            // Clear error on change
            if (errors.location) {
              setErrors({ ...errors, location: "" });
            }
          }}
          className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"
        >
          {locations.map((region) => (
            <div key={region.id}>
              <RadioGroupItem
                value={region.short}
                id={region.city}
                className="peer sr-only"
                disabled={!region.available}
              />
              <Label
                htmlFor={region.city}
                className="flex items-center gap-3 rounded-md bg-white/10 border-2 border-transparent cursor-pointer p-4 transition-all peer-data-[state=checked]:border-blue-500"
              >
                <Image
                  src={`https://flagsapi.com/${region.country_code}/flat/64.png`}
                  alt={region.city}
                  width={32}
                  height={24}
                  className="rounded-sm"
                />
                <div>
                  <div className="font-medium text-white">
                    {region.city}
                  </div>
                  <div className="text-xs text-white/60">
                    {region.country}
                  </div>
                </div>
                {!region.available && (
                  <Badge
                    variant="outline"
                    className="text-xs ml-auto text-white/70 border-white/30"
                  >
                    Coming soon
                  </Badge>
                )}
              </Label>
            </div>
          ))}
        </RadioGroup>
        {errors.location && (
          <div className="flex items-center gap-2 text-red-500 text-sm mt-4">
            <AlertCircle className="w-4 h-4" />
            <span>{errors.location}</span>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button
          variant="outline"
          onClick={onPrev}
          className="rounded-md border-white/20 text-white hover:bg-white/10"
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