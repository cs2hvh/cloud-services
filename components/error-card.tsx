import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import Link from "next/link";

interface ErrorCardProps {
    text?: string;
}

export default function ErrorCard({ text }: ErrorCardProps) {
    const defaultText = "An error occurred while processing your request. Please try again later.";

    return (
        <div className="flex items-center justify-center min-h-screen p-4 bg-background">
            <Card className="max-w-md w-full">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-destructive" />
                        <CardTitle>Error</CardTitle>
                    </div>
                    <CardDescription>
                        Something went wrong
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">
                        {text || defaultText}
                    </p>
                </CardContent>
                <CardFooter className="flex gap-2">
                    <Button asChild>
                        <Link href="/">
                            Go to Homepage
                        </Link>
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
