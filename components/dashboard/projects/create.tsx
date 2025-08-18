'use client';

import { useState } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { projectSchema } from '@/types/zod/project';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import axios, { AxiosError } from 'axios';
import { useSession } from '@/app/dashboard/provider';
import { SidebarMenuButton } from '@/components/ui/sidebar';
import { PlusCircle } from 'lucide-react';

type ProjectData = z.infer<typeof projectSchema>;

const CreateProjectDialog = () => {
    const { user } = useSession();
    const [open, setOpen] = useState(false);

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors, isSubmitting },
    } = useForm<ProjectData>({
        resolver: zodResolver(projectSchema),
        defaultValues: {
            name: '',
            description: '',
        },
    });

    const onSubmit = async (data: ProjectData) => {
        try {
            await axios.post("/api/projects", {
                ...data,
                owner: user?.id, // Static for now
            })

            toast.success(`Project "${data.name}" was successfully created.`);

            reset();
            setOpen(false);
        } catch (err) {
            const error = err as AxiosError<{ message?: string }>;

            const message =
                error.response?.data?.message || 'Failed to update project.';

            toast.error(message);

            // console.error('[EditProjectForm]', error);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <SidebarMenuButton>
                    <PlusCircle />
                    <span>New Project</span>
                </SidebarMenuButton>
            </DialogTrigger>

            <DialogContent>
                <DialogTitle>Create New Project</DialogTitle>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-4">
                    <div className="space-y-1.5">
                        <Label>Name</Label>
                        <Input {...register('name')} />
                        {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
                    </div>

                    <div className="space-y-1.5">
                        <Label>Description</Label>
                        <Textarea {...register('description')} />
                    </div>

                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? 'Creating...' : 'Create Project'}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default CreateProjectDialog;