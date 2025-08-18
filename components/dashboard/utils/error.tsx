
export const ErrorMessage = ({ message }: { message: string }) => {
    return (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-200">
            {message}
        </div>
    );
};
