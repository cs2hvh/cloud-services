// Re-export the canonical handlers from the main app. During the incremental
// migration the implementation stays in one place; once this section is fully
// cut over, the implementation moves here and the main-app route is deleted.
export { GET, PATCH } from "@/app/api/admin/users/route";
