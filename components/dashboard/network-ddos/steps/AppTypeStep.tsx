'use client';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AppWindow, ChevronRight } from "lucide-react";
import { StepProps } from "./types";
import { toast } from "sonner";

export const AppTypeStep = ({ formData, onUpdate, onNext }: StepProps) => {
  const handleNext = () => {
    if (!formData.appType) {
      toast.error('Please select an application type');
      return;
    }
    onNext();
  };

  return (
    <Card className="bg-white/5 border-white/10">
      <CardHeader>
        <div className="flex gap-2 ">
          <AppWindow className="w-5 h-5 text-blue-400 " />
          <CardTitle className="text-white">Application Type</CardTitle>
        </div>
        <div className="flex flex-col gap-1 mt-2">
          <p className="text-sm text-white/60">
            Choose the type of application
          </p>
          <p className="text-xs text-white/60 ">
            The application type determine the protocol by which data travels
            from the edge to your origin
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <div >
          <Select
            value={formData.appType}
            onValueChange={(value: "tcp" | "udp") =>
              onUpdate({ appType: value })
            }
          >
            <SelectTrigger
              id="app-type"
              className="cursor-pointer bg-white/10 border-white/20 text-white"
            >
              <SelectValue placeholder="Select protocol type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tcp">TCP</SelectItem>
              <SelectItem value="udp">UDP</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
      <CardFooter className="flex justify-end">
        <Button
          onClick={handleNext}
          className="cursor-pointer cursor-pointer bg-white text-black rounded-md hover:bg-white/90"
        >
          Next <ChevronRight size={16} className="ml-2" />
        </Button>
      </CardFooter>
    </Card>
  );
};
