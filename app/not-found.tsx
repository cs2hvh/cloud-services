import { buttonVariants } from "@/components/ui/button";
import WidthWrapper from "@/components/ui/width-wrapper";
import { cn } from "@/lib/utils";
import Link from "next/link";

const NotFound = () => (
    <WidthWrapper>
        <div className='pb-3 py-20'>
            <h1 className="text-3xl font-normal tracking-wide dark:text-gray-100 text-gray-800">404 <span className='text-primary' >|</span> Not Found</h1>
            <p className='dark:text-gray-300 text-gray-700 pt-1 text-md lg:text-md' >
                Maybe this page hasn&apos;t been implemented yet, and/or you stumbled across a dead link.
            </p>
            <Link href="/" className={cn(buttonVariants({ size: "sm" }), 'my-3')}>
                GO HOME
            </Link>
        </div>
    </WidthWrapper>
)

export default NotFound