"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { MapPin, Calendar, Search } from "lucide-react";
import heroBg from "../../public/images/hero-bg.png";

export function HeroSearch() {
    const router = useRouter();

    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = e.currentTarget;
        const formData = new FormData(form);
        const destination = String(formData.get("destination") ?? "").trim();
        const params = new URLSearchParams();
        if (destination) params.set("location", destination);
        const qs = params.toString();
        router.push(qs ? `/hotels?${qs}` : "/hotels");
    }

    return (
        <section className="relative flex min-h-[70vh] flex-col justify-center overflow-hidden bg-slate-900">
            <Image
                src={heroBg}
                alt=""
                fill
                priority
                sizes="100vw"
                className="object-cover"
                aria-hidden
            />
            {/* Overlay for readability */}
            <div className="absolute inset-0 bg-black/45" aria-hidden />
            <div className="relative z-10 mx-auto w-full max-w-6xl px-4 py-20 text-center">
                <h1 className="text-4xl font-bold tracking-tight text-white md:text-5xl lg:text-6xl">
                    Find your perfect stay
                </h1>
                <p className="mx-auto mt-4 max-w-xl text-lg text-white/90">
                    Search for luxury hotels and cozy stays around Romblon.
                </p>

                {/* Search bar — white rounded container */}
                <div className="mx-auto mt-10 max-w-4xl">
                    <form
                        onSubmit={handleSubmit}
                        className="flex flex-col gap-3 rounded-xl border border-white/20 bg-white/95 p-4 shadow-xl backdrop-blur sm:flex-row sm:items-end sm:gap-4"
                    >
                        <div className="flex-1">
                            <label htmlFor="hero-destination" className="sr-only">
                                Destination
                            </label>
                            <div className="relative">
                                <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    id="hero-destination"
                                    type="text"
                                    name="destination"
                                    placeholder="Destination"
                                    className="w-full rounded-lg border border-input bg-background py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                        </div>
                        <div className="flex flex-1 gap-2 sm:flex-initial">
                            <div className="relative flex-1 sm:w-44">
                                <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    type="date"
                                    placeholder="Check-in"
                                    className="w-full rounded-lg border border-input bg-background py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                            <span className="hidden self-center text-muted-foreground sm:inline">
                                –
                            </span>
                            <div className="relative flex-1 sm:w-44">
                                <input
                                    type="date"
                                    placeholder="Check-out"
                                    className="w-full rounded-lg border border-input bg-background py-2.5 pl-3 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                        </div>
                        <button
                            type="submit"
                            className="flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
                        >
                            <Search className="h-4 w-4" />
                            Search
                        </button>
                    </form>
                </div>
            </div>
        </section>
    );
}
