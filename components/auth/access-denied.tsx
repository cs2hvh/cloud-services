import { buttonVariants } from '@/components/ui/button';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { XCircle } from 'lucide-react';
import Link from 'next/link';

const AccessDenied = () => {
    return (
        <div className="flex items-center justify-center min-h-screen p-4">
            <Card className="w-full max-w-md border bg-secondary/50 shadow-lg">
                <CardHeader className="pb-4">
                    <div className="flex justify-center mb-4">
                        <XCircle className="h-16 w-16 text-red-400" />
                    </div>
                    <CardTitle className="text-2xl font-bold text-center">Access Denied</CardTitle>
                    <CardDescription className="text-center text-muted-foreground">
                        You don&apos;t have permission to access this resource
                    </CardDescription>
                </CardHeader>
                <CardFooter className="flex justify-center -mt-2">
                    <Link href={`/dashboard`} className={buttonVariants({ variant: "outline" })}>
                        Return to Dashboard
                    </Link>
                </CardFooter>
            </Card>
        </div>
    );
};

export default AccessDenied;