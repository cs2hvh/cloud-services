import { SidebarLayout } from "@/components/dashboard/sidebar/layout"
import Link from "next/link"

const DatabasePage = () => {
    return (
        <SidebarLayout>
            <Link href="/dashboard/services/database/new">New</Link>
        </SidebarLayout>
    )
}

export default DatabasePage