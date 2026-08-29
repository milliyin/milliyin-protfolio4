export const long = (date: Date) => {
    return date.toLocaleDateString("en-US", {
        timeZone: "UTC",
        month: "long",
        day: "numeric",
        year: "numeric"
    });
};

export const short = (date: Date) => {
    return date.toLocaleDateString("en-US", {
        timeZone: "UTC",
        month: "short",
        year: "numeric"
    });
};
