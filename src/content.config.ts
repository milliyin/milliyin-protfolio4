import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const projectsCollection = defineCollection({
    loader: glob({ base: "./src/content/projects", pattern: "**/*.md" }),
    schema: z.object({
        title: z.string(),
        metaTitle: z.string(),
        description: z.string(),
        metaDescription: z.string(),
        featured: z.boolean(),
        createdAt: z.date(),
        repo: z.string().url().optional(),
        site: z.string().url().optional(),
        article: z.string().url().optional(),
        heroImage: z.string().optional(),
        heroAlt: z.string().optional(),
        tags: z.array(z.string()).optional()
    })
});

const postsCollection = defineCollection({
    loader: glob({ base: "./src/content/posts", pattern: "**/*.md" }),
    schema: z.object({
        title: z.string(),
        description: z.string(),
        createdAt: z.date(),
        updatedAt: z.date().optional(),
        category: z.string().optional(),
        readingTime: z.string().optional(),
        heroImage: z.string().optional(),
        heroAlt: z.string().optional(),
        tags: z.array(z.string()).optional()
    })
});

const experienceCollection = defineCollection({
    loader: glob({ base: "./src/content/experience", pattern: "**/*.md" }),
    schema: z.object({
        shortTitle: z.string(),
        longTitle: z.string(),
        company: z.string(),
        location: z.string().optional(),
        startDate: z.date(),
        type: z.enum(["Full-time", "Part-time", "Internship", "Volunteer"]),
        endDate: z.date(),
        present: z.boolean()
    })
});

const skillsCollection = defineCollection({
    loader: glob({ base: "./src/content/skills", pattern: "**/*.md" }),
    schema: z.object({
        id: z.number(),
        title: z.string(),
        examples: z.array(z.string())
    })
});

export const collections = {
    projects: projectsCollection,
    posts: postsCollection,
    skills: skillsCollection,
    experience: experienceCollection
};
