'use client';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import { StepProps } from "./types";
import { toast } from "sonner";

export const EdgePortStep = ({ formData, onUpdate, onNext, onBack }: StepProps) => {
  const handleNext = () => {
    if (!formData.edgePort || formData.edgePort < 1 || formData.edgePort > 65535) {
      toast.error('Please enter a valid port number (1-65535)');
      return;
    }
    onNext();
  };

  const handlePortChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (isNaN(value)) {
      onUpdate({ edgePort: 0 });
      return;
    }
    
    // Clamp between 1 and 65535
    const clampedValue = Math.min(Math.max(value, 1), 65535);
    onUpdate({ edgePort: clampedValue });
  };

  return (
    <Card className="glass-panel overflow-hidden">
      <CardHeader>
        <CardTitle className="text-white">Edge Port</CardTitle>
        <p className="text-sm text-white/60">
          Enter the edge port. One or more anycast addresses will represent your service.We will listen to incoming connections to these addresses on this port.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <Label htmlFor="edge-port" className="text-white">Port Number</Label>
          <Input
            id="edge-port"
            value={formData.edgePort || ''}
            onChange={handlePortChange}
            type="number"
            min={1}
            max={65535}
            placeholder="8080"
            className="bg-white/10 border-white/20 rounded-md text-white placeholder:text-white/50"
          />
          <p className="text-xs text-white/60 mt-2">
            Enter a port number between 1 and 65535
          </p>
        
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button
          variant="outline"
          onClick={onBack}
          className="cursor-pointer rounded-md border-white/[0.14] bg-white/[0.03] text-white/82 hover:bg-white/[0.07]"
        >
          Back
        </Button>
        <Button
          onClick={handleNext}
          className="cursor-pointer rounded-md border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500"
        >
          Next <ChevronRight size={16} className="ml-2" />
        </Button>
      </CardFooter>
    </Card>
  );
};
