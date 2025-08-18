'use client';

import { useState } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tables } from '@/lib/supabase/types';
import { projectSchema } from '@/types/zod/project';
import axios, { AxiosError } from 'axios';
import { toast } from 'sonner';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"

type FormData = z.infer<typeof projectSchema>;

type Props = {
    project: Tables<'projects'>;
};

const EditProjectForm = ({ project }: Props) => {
    const {
        register,
        handleSubmit,
        setValue,
        formState: { errors, isSubmitting },
    } = useForm<FormData>({
        resolver: zodResolver(projectSchema),
        defaultValues: {
            name: project.name,
            description: project.description || '',
        },
    });

    const onSubmit = async (data: FormData) => {
        try {
            await axios.patch(`/api/projects/${project.id}`, data);
            toast.success(`Changes to "${data.name}" have been saved.`);
        } catch (err) {
            const error = err as AxiosError<{ message?: string }>;

            const message =
                error.response?.data?.message || 'Failed to update project.';

            toast.error(message);

            // console.error('[EditProjectForm]', error);
        }
    };


    return (
        <Card>
            <CardHeader>
                <CardTitle>Project Settings</CardTitle>
                <CardDescription>View/Manage Project details</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className='space-y-1'>
                        <Label>Name</Label>
                        <Input {...register('name')} />
                        {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
                    </div>

                    <div className='space-y-1'>
                        <Label>Description</Label>
                        <Textarea {...register('description')} />
                    </div>

                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? 'Saving...' : 'Save Changes'}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
};

export default EditProjectForm;