import React from "react";
import { assetUrl } from "@/lib/asset-url";
import { Database } from "lucide-react";
import Image from "next/image";

interface DatabaseIconProps {
  engine: string;
  className?: string;
}

export const DatabaseIcon = ({ engine, className = "h-8 w-8" }: DatabaseIconProps) => {
  const engineLower = engine.toLowerCase();

//   https://cdn.jsdelivr.net/gh/devicons/devicon/icons/mongodb/mongodb-original.svg
//   https://cdn.jsdelivr.net/gh/devicons/devicon/icons/mysql/mysql-original.svg
//   /kafka.png
//   https://cdn.jsdelivr.net/gh/devicons/devicon/icons/postgresql/postgresql-original.svg
//   // Return appropriate icon based on database engine
  if (engineLower.includes("mysql")) {
    return (
      <div className={`${className} text-blue-400 flex items-center justify-center`}>
        <Image
          src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/mysql/mysql-original.svg"
          alt="Kafka Icon"
          width={20}
          height={20}
          className="object-contain"
          unoptimized
        />
      </div>
    );
  }

  if (engineLower.includes("kafka") ) {
    return (
      <div className={`${className} text-blue-500 flex items-center justify-center`}>
        <Image
          src={assetUrl("/kafka.png")}
          alt="Kafka Icon"
          width={20}
          height={20}
          className="object-contain"
        />
      </div>
    );
  }

  if (engineLower.includes("pg") || engineLower.includes("postgres")) {
    return (
     <div className={`${className} text-blue-500 flex items-center justify-center`}>
        <Image
          src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/postgresql/postgresql-original.svg"
          alt="PostgreSQL Icon"
          width={20}
          height={20}
           className="object-contain"
           unoptimized
        />
      </div>
    );
  }

  if (engineLower.includes("redis")) {
    return (
      <div className={`${className} text-red-500 flex items-center justify-center`}>
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
          <path d="M10.5 2.661l.54.997-1.797.644 2.409.218.748 1.246c.84-.476 1.744-.875 2.7-1.188l-.748-1.246L16.096 3l-2.63-.367C12.37 1.656 10.387.807 7.928.807c-2.458 0-4.441.849-5.538 1.826l-.004-.006L0 3.577l1.787.642L0 5.466l1.785.64L0 7.349l2.387.858 2.04-.734-4.15 1.492c-.028.008-.052.026-.08.036.025.008.048.029.076.037l3.598 1.295-.002.002 1.282.46c1.096.977 3.079 1.826 5.537 1.826 2.459 0 4.442-.85 5.538-1.827l3.598-1.295c.028-.008.052-.029.076-.037-.028-.01-.052-.028-.08-.036l-2.057-.74 2.04.734 2.388-.858L20.12 8.52l-.001-.001 1.787-.642-2.386-.858 1.788-.642-.003-.004.002.002-.002-.002c-1.096-.978-3.08-1.827-5.538-1.827-2.458 0-4.441.849-5.537 1.827l-.002-.002zM7.05 10.602a.3.3 0 01-.3.3H5.252a.3.3 0 01-.3-.3V9.105a.3.3 0 01.3-.3H6.75a.3.3 0 01.3.3v1.497zm2.175-1.497c0-.165.135-.3.3-.3h1.497a.3.3 0 01.3.3v1.497a.3.3 0 01-.3.3H9.525a.3.3 0 01-.3-.3V9.105zm3.672 0c0-.165.135-.3.3-.3h1.497a.3.3 0 01.3.3v1.497a.3.3 0 01-.3.3h-1.497a.3.3 0 01-.3-.3V9.105zm3.672 0c0-.165.135-.3.3-.3h1.497a.3.3 0 01.3.3v1.497a.3.3 0 01-.3.3h-1.497a.3.3 0 01-.3-.3V9.105zM7.928 4.307c-2.459 0-4.442.85-5.538 1.827-.028.025-.052.053-.08.08.028.025.052.053.08.078 1.096.978 3.079 1.827 5.538 1.827 2.459 0 4.441-.849 5.537-1.827.028-.025.052-.053.08-.078a1.046 1.046 0 01-.08-.08c-1.096-.977-3.078-1.827-5.537-1.827zm8.63 2.46c2.458 0 4.441.849 5.537 1.827.028.025.052.053.08.078-.028.025-.052.053-.08.08-1.096.977-3.079 1.826-5.537 1.826-2.459 0-4.442-.849-5.538-1.827-.028-.025-.052-.053-.08-.079.028-.025.052-.053.08-.078 1.096-.978 3.079-1.827 5.538-1.827z"/>
        </svg>
      </div>
    );
  }

  if (engineLower.includes("mongo")) {
    return (
      <div className={`${className} text-blue-500 flex items-center justify-center`}>
        <Image
          src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/mongodb/mongodb-original.svg"
          alt="MongoDB Icon"
          width={20}
          height={20}
           className="text-white"
           unoptimized
        />
      </div>
    );
  }

  // Default database icon for unknown types
  return <Database className={`${className} text-blue-400`} />;
};
