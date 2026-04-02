from aeko_sdk import AekoClient


def main() -> None:
    client = AekoClient("https://api.testnet.aeko.chain")
    blockhash = client.get_latest_blockhash()
    print("latest blockhash:", blockhash)


if __name__ == "__main__":
    main()
