"use client";

import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { projectSchema } from "@/types/zod/project";
import { toast } from "sonner";
import { useSession } from "@/app/dashboard/provider";
import api from "@/lib/axios/axios";
import { useRouter } from "next/navigation";

type ProjectData = z.infer<typeof projectSchema>;

const ProjectCreateForm = () => {
  const { user } = useSession();
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProjectData>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const onSubmit = async (data: ProjectData) => {
    try {
      const response = await api.post("/projects", {
        ...data,
        owner: user?.id,
      });

      if (response.status === 201) {
        toast.success(`Project "${data.name}" was successfully created.`);
        router.push(`/dashboard/projects/${response.data.id}`);
      }
    } catch (error) {
      console.error("Error creating project:", error);
      toast.error("Failed to create project. Please try again.");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name" className="text-white text-sm font-medium">
          Name
        </Label>
        <Input
          id="name"
          {...register("name")}
          placeholder="Enter project name"
          className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-400 h-10 rounded-sm"
        />
        {errors.name && (
          <p className="text-sm text-red-400">{errors.name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description" className="text-white text-sm font-medium">
          Description
        </Label>
        <Textarea
          id="description"
          {...register("description")}
          placeholder="Project description (optional)"
          className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-400 min-h-[80px] resize-none rounded-sm"
        />
        {errors.description && (
          <p className="text-sm text-red-400">{errors.description.message}</p>
        )}
      </div>

      <div className="flex gap-3 pt-4">
        <Button
          type="submit"
          disabled={isSubmitting}
          className="bg-white hover:bg-slate-100 text-black px-6 cursor-pointer rounded-sm"
        >
          {isSubmitting ? "Creating..." : "Create Project"}
        </Button>
        
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          className="border-slate-700 text-white hover:bg-slate-800 cursor-pointer rounded-sm"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
};

export default ProjectCreateForm;