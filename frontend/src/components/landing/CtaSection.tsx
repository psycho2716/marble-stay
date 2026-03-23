import Link from "next/link";

export function CtaSection() {
  return (
    <section className="border-t border-border bg-muted/50 px-4 py-16 md:py-20">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          Experience Marble Stay
        </h2>
        <p className="mt-4 text-muted-foreground">
          Join thousands of travelers finding their dream destinations. From secluded
          mountain cabins to bustling city penthouses, we find the stay that matches your
          soul.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/signup"
            className="rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            Get Started Now
          </Link>
          <Link
            href="/hotels"
            className="rounded-lg border border-border bg-card px-6 py-3 text-sm font-medium text-foreground transition hover:bg-muted"
          >
            Learn More
          </Link>
        </div>
      </div>
    </section>
  );
}
