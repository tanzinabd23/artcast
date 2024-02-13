import { LatestPrompts } from "@/components/LatestPrompts";
import { RecentHistory } from "@/components/RecentHistory";
import { Button } from "@/components/ui/button";
import { TypographyH2, TypographyH3 } from "@/components/ui/typography";
import { generateImage } from "@/lib/actions/generateImage";
import ErrorFrame from "@/lib/components/frames/ErrorFrame";
import GeneratingFrame from "@/lib/components/frames/GeneratingFrame";
import RootFrame from "@/lib/components/frames/RootFrame";
import { fetchCast } from "@/lib/supabase/functions/fetchCast";
import { lockLayer } from "@/lib/supabase/functions/lockLayer";
import { storeCast } from "@/lib/supabase/functions/storeCast";
import { supabaseClient } from "@/lib/supabase/supabaseClient";
import { Cast } from "@/lib/types/cast.interface";
import { convertSupabaseDateToHumanReadable } from "@/lib/utils";
import { FrameContainer, FrameImage, FrameReducer, FrameButton, useFramesReducer, getPreviousFrame, NextServerPageProps, FrameInput } from "frames.js/next/server";
import Link from "next/link";

type Stage = 'start' | 'view' | 'generate' | 'created' | 'error';

type State = {
    stage: Stage;
    total_button_presses: number;
    input_text: string;
    currentCastId: number;
    error?: string;
};

const reducer: FrameReducer<State> = (state, action) => {
    // start
    if (state.stage == 'start') {
        return {
            stage: 'view',
            total_button_presses: state.total_button_presses + 1,
            input_text: '',
            currentCastId: state.currentCastId
        }
    }

    // generate a new Artcast
    if (state.stage == 'view' && action.postBody?.untrustedData.buttonIndex == 2) {
        if (!action.postBody.untrustedData.inputText) {
            return {
                stage: 'error',
                total_button_presses: state.total_button_presses + 1,
                input_text: '',
                error: 'You need to specify a prompt to continue.',
                currentCastId: state.currentCastId
            }
        }
        return {
            stage: 'generate',
            total_button_presses: state.total_button_presses + 1,
            input_text: action.postBody.untrustedData.inputText,
            currentCastId: state.currentCastId
        }
    }

    if (state.stage == 'created') {
        return {
            stage: 'created',
            total_button_presses: state.total_button_presses + 1,
            input_text: '',
            currentCastId: state.currentCastId
        }
    }

    if (state.stage == 'generate') {
        return {
            stage: 'created',
            total_button_presses: state.total_button_presses + 1,
            input_text: '',
            currentCastId: state.currentCastId
        }
    }

    if (state.stage == 'error') {
        return {
            stage: 'view',
            total_button_presses: state.total_button_presses + 1,
            input_text: '',
            currentCastId: state.currentCastId
        }
    }

    return {
        stage: 'view',
        total_button_presses: state.total_button_presses + 1,
        input_text: '',
        currentCastId: state.currentCastId
    }
}

export default async function Home({ params, searchParams }: NextServerPageProps) {
    const previousFrame = getPreviousFrame<State>(searchParams);

    //@ts-ignore
    let pathname = `/cast/${params.id}`;
    //@ts-ignore
    const [state, dispatch] = useFramesReducer<State>(reducer, { currentCastId: params.id, stage: 'start', total_button_presses: 0, input_text: '' }, previousFrame);

    if (state.stage == 'error') {
        return (
            <div className="p-4">
                :D YAAAAY
                {/* <RootFrame imageSrc={data.publicUrl} castInfo={cast} /> */}
                <FrameContainer
                    pathname={pathname}
                    postUrl="/frames"
                    state={state}
                    previousFrame={previousFrame}
                >
                    <FrameImage>
                        <ErrorFrame error={state.error as string} />
                    </FrameImage>
                    <FrameButton onClick={dispatch}>Retry</FrameButton>
                </FrameContainer>
            </div>
        )
    }

    //@ts-ignore
    const cast = await fetchCast(state.currentCastId);
    console.log({ cast })
    if (!cast) {
        throw new Error('Could not find Cast.')
    }
    const { data } = supabaseClient.storage.from('artcast_images').getPublicUrl(cast.image_path as string);

    if (state.stage == 'generate') {
        let newBranchNum = cast.branch_num + 1
        //@ts-ignore
        let newCastInfo: Cast = {
            name: cast.name,
            farcaster_id: 'jacobmtucker',
            image_path: null,
            branch_num: newBranchNum,
            num_derivatives: 0,
            num_total_derivatives: 0,
            parent_id: state.currentCastId,
            prompt_input: state.input_text,
            // will get replaced
            id: 0,
            layer_1_cast_id: newBranchNum == 2 ? cast.id : newBranchNum > 2 ? cast.layer_1_cast_id : null,
            layer_1_cast: { locked: false },
            locked: false
        }
        const createdArtcastId = await storeCast(
            newCastInfo.name,
            newCastInfo.farcaster_id,
            newCastInfo.image_path,
            newCastInfo.parent_id,
            newCastInfo.branch_num,
            newCastInfo.prompt_input,
            newCastInfo.layer_1_cast_id
        );
        generateImage(cast.name, cast.image_path as string, state.input_text, createdArtcastId as number);
        state.currentCastId = createdArtcastId as number;
        newCastInfo.id = createdArtcastId as number;
        if (newCastInfo.branch_num == 10) {
            lockLayer(newCastInfo.layer_1_cast_id as number);
        }

        return (
            <div className="p-4">
                generating
                {/* <RootFrame imageSrc={data.publicUrl} castInfo={cast} /> */}
                <FrameContainer
                    pathname={pathname}
                    postUrl="/frames"
                    state={state}
                    previousFrame={previousFrame}
                >
                    {/* <FrameImage src={data.publicUrl} /> */}
                    <FrameImage>
                        <GeneratingFrame />
                    </FrameImage>
                    <FrameButton onClick={dispatch}>Refresh</FrameButton>
                </FrameContainer>
            </div>
        )
    }

    if (state.stage == 'view') {
        return (
            <div className="flex min-h-screen flex-col items-center gap-3 p-24">
                <RootFrame imageSrc={data.publicUrl} castInfo={cast} type={cast.branch_num == 0 ? 'root' : 'derivative'} /> :
                <FrameContainer
                    pathname={pathname}
                    postUrl="/frames"
                    state={state}
                    previousFrame={previousFrame}
                >
                    <FrameImage>
                        <RootFrame imageSrc={data.publicUrl} castInfo={cast} type={cast.branch_num == 0 ? 'root' : 'derivative'} /> :
                    </FrameImage>
                    {!cast.locked ? <FrameInput text="add a prompt..." /> : null}
                    <FrameButton href={`https://artcast.ai/cast/${cast.id}`}>Stats</FrameButton>
                    {!cast.locked ? <FrameButton onClick={dispatch}>Create</FrameButton> : null}
                </FrameContainer>
            </div>
        )
    }

    if (state.stage === 'created') {
        if (cast.image_path) {
            return (
                <div className="p-4">
                    :D YAAAAY
                    {/* <RootFrame imageSrc={data.publicUrl} castInfo={cast} /> */}
                    <FrameContainer
                        pathname={`/cast/${cast.id}`}
                        postUrl="/frames"
                        state={state}
                        previousFrame={previousFrame}
                    >
                        {/* <FrameImage src={data.publicUrl} /> */}
                        <FrameImage>
                            <RootFrame imageSrc={data.publicUrl} castInfo={cast} type='created' />
                        </FrameImage>
                        <FrameButton href={`https://artcast.ai/cast/${cast.id}`}>Share as a cast to keep alive.</FrameButton>
                    </FrameContainer>
                </div>
            )
        } else {
            return (
                <div className="p-4">
                    generating
                    {/* <RootFrame imageSrc={data.publicUrl} castInfo={cast} /> */}
                    <FrameContainer
                        pathname={pathname}
                        postUrl="/frames"
                        state={state}
                        previousFrame={previousFrame}
                    >
                        {/* <FrameImage src={data.publicUrl} /> */}
                        <FrameImage>
                            <GeneratingFrame />
                        </FrameImage>
                        <FrameButton onClick={dispatch}>Refresh</FrameButton>
                    </FrameContainer>
                </div>
            )
        }
    }

    if (state.stage == 'start') {
        return (
            <>
                <div className="p-8 pt-6 flex-1">
                    <TypographyH2>Dashboard</TypographyH2>
                    <div className="mt-6">
                        <div className="mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 space-y-4">
                            <div className="flex gap-8 items-center">
                                <img className="w-[25%] max-w-[300px] h-auto rounded-full" src={data.publicUrl} alt="cast" />
                                <div>
                                    <p className="text-sm text-muted-foreground">Artcast #{cast.id} by <Button asChild variant={'link'} className="p-0 m-0"><Link style={{ height: 0 }} href={`https://warpcast.com/${cast.farcaster_id}`} target="_blank">@{cast.farcaster_id}</Link></Button></p>
                                    <TypographyH3>{cast.name}</TypographyH3>
                                    <p className="text-sm text-muted-foreground">Created on {convertSupabaseDateToHumanReadable(cast.created_at)}</p>
                                </div>
                            </div>
                            <div className="grid gap-4 md:grd-cols-2 lg:grid-cols-4">
                                <div className="rounded-xl border bg-card text-card-foreground shadow">
                                    <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
                                        <h3 className="tracking-tight text-sm font-medium">Latest Prompt</h3>
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" className="h-4 w-4 text-muted-foreground">
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                                        </svg>
                                    </div>
                                    <div className="p-6 pt-0">
                                        <div className="text-2xl font-bold">{cast.latest_prompts.length ? cast.latest_prompts[0].prompt_input : 'None!'}</div>
                                    </div>
                                </div>
                                <div className="rounded-xl border bg-card text-card-foreground shadow">
                                    <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
                                        <h3 className="tracking-tight text-sm font-medium">Total Remixes</h3>
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" className="h-4 w-4 text-muted-foreground">
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z" />
                                        </svg>

                                    </div>
                                    <div className="p-6 pt-0">
                                        <div className="text-2xl font-bold">{cast.num_total_derivatives}</div>
                                    </div>
                                </div>
                                <div className="rounded-xl border bg-card text-card-foreground shadow">
                                    <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
                                        <h3 className="tracking-tight text-sm font-medium">Direct Remixes</h3>
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" className="h-4 w-4 text-muted-foreground">
                                            <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 5.25 7.5 7.5 7.5-7.5m-15 6 7.5 7.5 7.5-7.5" />
                                        </svg>

                                    </div>
                                    <div className="p-6 pt-0">
                                        <div className="text-2xl font-bold">{cast.num_derivatives}</div>
                                    </div>
                                </div>
                            </div>
                            <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
                                <RecentHistory versions={cast.version_history}></RecentHistory>
                                <LatestPrompts versions={cast.latest_prompts}></LatestPrompts>
                            </div>
                        </div>
                    </div>
                </div>
                <FrameContainer
                    pathname={pathname}
                    postUrl="/frames"
                    state={state}
                    previousFrame={previousFrame}
                >
                    {/* <FrameImage src={data.publicUrl} /> */}
                    <FrameImage>
                        <RootFrame imageSrc={data.publicUrl} castInfo={cast} type='start' />
                    </FrameImage>
                    <FrameButton onClick={dispatch}>Join</FrameButton>
                </FrameContainer>
            </>
        )
    }
}