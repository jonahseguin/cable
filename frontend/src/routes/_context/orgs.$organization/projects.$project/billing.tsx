import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_context/orgs/$organization/projects/$project/billing",
)({
	beforeLoad: async ({ params }) => {
		const { organization, project } = params;

		throw redirect({
			to: "/orgs/$organization/projects/$project",
			params: { organization, project },
			search: { settings: "billing" },
		});
	},
});
