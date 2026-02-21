import React from "react";

type ContainerProps = {
  children: React.ReactNode;
  className?: string;
};

export function Container({ children, className = "" }: ContainerProps) {
  return (
    <div className="w-full">
      <div className={`mx-auto w-full max-w-[75%] px-[clamp(24px,3vw,80px)] ${className}`}>
        {children}
      </div>
    </div>
  );
}

export function WideContainer({ children, className = "" }: ContainerProps) {
  return (
    <div className="w-full">
      <div className={`mx-auto w-full max-w-[2300px] px-[clamp(20px,2.6vw,120px)] ${className}`}>
        {children}
      </div>
    </div>
  );
}

export default Container;
