import Image from "next/image";

export function KubernetesIcon({ className = "" }) {
  return (
    <div className={`${className} flex items-center justify-center`}>
      <Image
        src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/kubernetes/kubernetes-original.svg"
        alt="Kubernetes Icon"
        width={24}
        height={24}
        className="object-contain"
      />
    </div>
  );
}
