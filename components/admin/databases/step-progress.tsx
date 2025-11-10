import { CheckCircle2 } from "lucide-react";

interface StepProgressProps {
  currentStep: number;
  steps: Array<{ id: number; name: string }>;
}

export const StepProgress = ({ currentStep, steps }: StepProgressProps) => {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-2">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center flex-1">
            {/* Step circle */}
            <div className="flex flex-col items-center">
              <div
                className={`shrink-0 rounded-full flex items-center justify-center transition-colors duration-300
                  w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 ${
                    currentStep > step.id
                      ? "bg-blue-600 text-white"
                      : currentStep === step.id
                        ? "bg-blue-500 text-white"
                        : "bg-white/10 text-white/50"
                  }`}
              >
                {currentStep > step.id ? (
                  <CheckCircle2 size={16} />
                ) : (
                  step.id
                )}
              </div>
              
              {/* Step name */}
              <p
                className={`mt-2 text-center truncate max-w-[72px] sm:max-w-[112px] md:max-w-[140px]
                  text-[10px] sm:text-xs md:text-sm ${
                    currentStep >= step.id ? "text-white" : "text-white/50"
                  }`}
                title={step.name}
              >
                {step.name}
              </p>
            </div>
            
            {/* Connecting line - only show if not the last step */}
            {index < steps.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-4 transition-colors duration-300 ${
                  currentStep > step.id ? "bg-blue-600" : "bg-white/10"
                }`}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};